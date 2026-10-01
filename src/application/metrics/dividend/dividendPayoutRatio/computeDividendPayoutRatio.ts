import { resolveQuarterOrLatest } from '@/application/financials/latestQuarter';
import { toPercent } from '@/domain/metrics/shared/numericHelpers';
import { pickNetIncomeWithFieldKey as pickNetIncome, type PickedField } from '@/domain/metrics/shared/pickers';
import { rocYearToGregorian, type Season } from '@/domain/calendar/rocQuarter';
import type { QuarterlyMetricQuery } from '@/domain/financials/quarterlyMetric';
import { resolveKnowledgeDate, type KnowledgeDateResolution } from '../../knowledgeDate';
import type { MetricNullReason } from '../../../../domain/metrics/metricBasis';
import type { CashFlowFields } from '@/application/ports/financialStatements';
import { periodTypeGroup } from '@/domain/metrics/coordinate';
import { computation, type ComputationBatch, type ComputationSlot, noQuarterBatch, withFormulaVersion } from '@/domain/metrics/computation';
import { resolveAnnualReportContext } from '@/application/metrics/shared/annualReportSlot';
import { cashDividendFromEarningsPerShare, earningsPayoutRatio } from '@/domain/financials/earningsPayoutRatio';
import type { PitDeps } from '@/application/metrics/deps';
import { resolveTrailingCashFlowStatements, resolveTrailingIncomeStatements, type ReportingBasis } from '../../shared/trailingYear';

// 2026-09-27 formulaVersion 2：近四季任一季整份現金流量表缺席 → 算不出來（insufficient_history），不再當成那季沒發股利（2412 被算成 0）。
const DIVIDEND_PAYOUT_RATIO_FORMULA_VERSION = 2;

// 這份檔案是 src/domainMetrics/dividendPayoutRatio.ts 的獨立重新實作。只有 TTM 一種
// basis——股利通常一年發放 1-2 次，單季配息率會嚴重失真，舊架構本來就沒有 Q/Q_ANN。
//
// 2026-09-11：抽出 resolveDividendPayoutRatioInputs()，回傳原始欄位（附帶實際命中哪個
// fieldKey）+ 完整計算過程，給 getDividendPayoutRatioProvenance.ts（GET /companies/
// :symbol/metric-provenance 的 dividendPayoutRatio 試點）共用，寫入路徑
// （computeAndWriteDividendPayoutRatioPit）本身行為完全不變，只是內部改呼叫這個 resolver。

export interface DividendPayoutRatioTtmQuarterDetail {
  rocYear: number;
  season: number;
  fiscalYear: number;
  netIncome: PickedField;
  cashFlow: CashFlowFields | null;
}

export interface DividendPayoutRatioResolution {
  symbol: string;
  rocYear: string;
  season: string;
  fiscalYear: number;
  fiscalQuarter: number;
  basis: ReportingBasis; // 溯源表期間標籤用（trailingPeriodLabel）
  ttmQuarterDetails: DividendPayoutRatioTtmQuarterDetail[];
  ttmComplete: boolean;
  payoutRatioTtm: number | null;
  ttmNullReason: MetricNullReason | null;
  mainAnchor: KnowledgeDateResolution | null;
  ttmAnchor: KnowledgeDateResolution | null;
}

export const resolveDividendPayoutRatioInputs = async (
  query: QuarterlyMetricQuery,
  deps: DividendPayoutRatioDeps
): Promise<DividendPayoutRatioResolution | null> => {
  const { symbol, dataType, subsidiaryCompanyId } = query;

  const resolvedQuarter = await resolveQuarterOrLatest(query, ['incomeStatement', 'cashFlowStatement'], deps.quarters);

  if (!resolvedQuarter) return null;

  const { year, season } = resolvedQuarter;
  const rocYear = Number(year);
  const seasonNum = Number(season);
  const fiscalYear = rocYearToGregorian(rocYear);

  const key = { symbol, year: rocYear, quarter: seasonNum, dataType, subsidiaryCompanyId };
  const [incomeStatement, cashFlowStatement] = await Promise.all([deps.statements.getIncomeStatement(key), deps.statements.getCashFlowStatement(key)]);
  const reportDate = incomeStatement?.reportDate ?? cashFlowStatement?.reportDate ?? null;
  const mainAnchor = await resolveKnowledgeDate(symbol, [{ rocYear, season: seasonNum, reportDate }], deps.announcements);

  // TTM：近四季（含本季）淨利加總、股利發放加總——股利發放缺漏視為 0（大多數季度本來就沒發放，
  // 不是資料缺漏），只有淨利缺漏才讓這一季不齊，見 dividendPayoutRatio.ts 的既有邏輯。
  // 2026-10-01 近一年改走共用來源（興櫃半年頻，見 shared/trailingYear.ts）；上市櫃仍是近四季。兩個 resolver 的 periods 順序相同。
  const trailingKey = { symbol, rocYear, season: season as Season, dataType, subsidiaryCompanyId };
  const [trailingIncome, trailingCashFlow] = await Promise.all([resolveTrailingIncomeStatements(trailingKey, deps), resolveTrailingCashFlowStatements(trailingKey, deps)]);
  const ttmQuarters = trailingIncome.periods.map((p) => ({ year: p.year, season: p.season }));
  const ttmRecords = trailingIncome.periods.map((p, i) => [p.record, trailingCashFlow.periods[i]?.record ?? null] as const);

  const ttmQuarterDetails: DividendPayoutRatioTtmQuarterDetail[] = ttmQuarters.map((tq, i) => ({
    rocYear: Number(tq.year),
    season: Number(tq.season),
    fiscalYear: rocYearToGregorian(Number(tq.year)),
    netIncome: pickNetIncome(ttmRecords[i]![0]),
    cashFlow: ttmRecords[i]![1],
  }));

  let netIncomeTtmSum = 0n;
  let dividendsPaidTtmSum = 0n;
  let ttmComplete = true;
  // 2026-09-27 整份現金流量表缺席不能當成「沒發股利」：2412 114Q3 現金流量表缺（mops 114Q1~Q2 還沒補，單季推不出來），
  // 中華電的股利剛好在第三季付，近四季發放率被算成 0、nullReason 還是 null（web-nuxt 抓到）。科目 null 才視為 0（mops-ts 確認的語意），
  // 跟 chowderNumber／dividendGrowthRate／consecutiveDividendYears／dividendCoverageRatio 一致。
  for (const detail of ttmQuarterDetails) {
    if (detail.netIncome.value === null || detail.cashFlow === null) {
      ttmComplete = false;
    } else {
      netIncomeTtmSum += detail.netIncome.value;
      dividendsPaidTtmSum += detail.cashFlow?.dividendsPaid ?? 0n;
    }
  }

  const dividendsPaidAbs = dividendsPaidTtmSum < 0n ? -dividendsPaidTtmSum : dividendsPaidTtmSum;
  const payoutRatioTtm = ttmComplete && netIncomeTtmSum > 0n ? toPercent(dividendsPaidAbs, netIncomeTtmSum) : null;
  const ttmNullReason: MetricNullReason | null = payoutRatioTtm !== null ? null : ttmComplete ? 'zero_or_negative_denominator' : 'insufficient_history';

  const ttmAnchor = ttmComplete
    ? await resolveKnowledgeDate(
        symbol,
        ttmQuarters.map((tq, i) => ({ rocYear: Number(tq.year), season: Number(tq.season), reportDate: ttmRecords[i]![0]?.reportDate ?? null })), deps.announcements
      )
    : null;

  return { symbol, rocYear: year, season, fiscalYear, fiscalQuarter: seasonNum, basis: trailingIncome.basis, ttmQuarterDetails, ttmComplete, payoutRatioTtm, ttmNullReason, mainAnchor, ttmAnchor };
};


export type DividendPayoutRatioDeps = Pick<PitDeps, 'statements' | 'quarters' | 'announcements' | 'cumulativeStatements'>;
export type DividendPayoutRatioComputeDeps = DividendPayoutRatioDeps & Pick<PitDeps, 'annualReports' | 'shares' | 'dividendEvents'>;

export type DividendPayoutRatioComputationBatch = ComputationBatch<'ttm' | 'fy'>;

export const computeDividendPayoutRatio = async (
  query: QuarterlyMetricQuery,
  deps: DividendPayoutRatioComputeDeps
): Promise<DividendPayoutRatioComputationBatch> => {
  const resolution = await resolveDividendPayoutRatioInputs(query, deps);
  if (!resolution) {
    return noQuarterBatch(query.symbol, ['ttm', 'fy']);
  }

  const { symbol, rocYear, season, fiscalYear, fiscalQuarter, ttmComplete, payoutRatioTtm, ttmNullReason, mainAnchor, ttmAnchor } = resolution;
  const coordinateBase = { symbol, metricCode: 'dividendPayoutRatio', fiscalYear, fiscalQuarter, dataType: query.dataType, subsidiaryCompanyId: query.subsidiaryCompanyId };

  let ttm: ComputationSlot;
  if (ttmComplete) {
    if (!ttmAnchor) {
      ttm = { action: 'skipped_no_knowledge_date' };
    } else {
      ttm = computation({
        ...coordinateBase,
        ...periodTypeGroup('TTM'),
        value: payoutRatioTtm,
        nullReason: ttmNullReason,
        knowledgeDate: ttmAnchor.knowledgeDate,
        knowledgeDateIsFallback: ttmAnchor.isFallback,
      });
    }
  } else if (mainAnchor) {
    ttm = computation({
      ...coordinateBase,
      ...periodTypeGroup('TTM'),
      value: null,
      nullReason: 'insufficient_history',
      knowledgeDate: mainAnchor.knowledgeDate,
      knowledgeDateIsFallback: mainAnchor.isFallback,
    });
  } else {
    ttm = { action: 'skipped_no_knowledge_date' };
  }

  const fy = await resolveEarningsPayoutRatioFy(query, Number(rocYear), fiscalQuarter, deps);
  return { symbol, rocYear, season, slots: withFormulaVersion({ ttm, fy }, DIVIDEND_PAYOUT_RATIO_FORMULA_VERSION) };
};

// 2026-09-28 FY：使用者點名「盈餘發放率這一頁應該用 FY 而不是近四季」——近四季把「公司在獲利下滑那年提高配息」
// 變成分母縮小的假訊號（2330 2023：近四季 27.94% → 34.79% 是 EPS 從 39.36 掉到 32.33 撐出來的；按盈餘所屬年度是
// 28.06% → 40.20%，配息從 11 元拉到 13 元）。口徑跟股利歷史頁的 payoutRatio 完全相同（domain/financials/earningsPayoutRatio.ts）：
// 該盈餘所屬年度的盈餘分配現金股利 ÷ 年報基本每股盈餘。座標、哪一年照 shared/annualReportSlot.ts（一年一列，第四季座標）；
// knowledge date = 年報公告日與該年度最後一次股利分派公告日取晚者（兩個數字都公開之後才算得出來）。
// 該年度還沒有任何分派公告（例如年報已出、董事會還沒決議）→ missing_input：分不出「不配息」還是「還沒公告」，不硬寫 0。
const resolveEarningsPayoutRatioFy = async (query: QuarterlyMetricQuery, rocYear: number, season: number, deps: DividendPayoutRatioComputeDeps): Promise<ComputationSlot> => {
  const { symbol, dataType, subsidiaryCompanyId } = query;
  const annual = await resolveAnnualReportContext({ symbol, rocYear, season, dataType, subsidiaryCompanyId }, deps);
  if (!annual) return { action: 'skipped_no_quarter' };
  if (!annual.anchor) return { action: 'skipped_no_knowledge_date' };
  const annualRocYear = annual.fiscalYear - 1911;
  const rows = (await deps.dividendEvents.listDividendDistributionRows(symbol)).filter((row) => row.rocFiscalYear === annualRocYear);
  const eps = annual.annual.basicEps;
  const value = rows.length === 0 ? null : earningsPayoutRatio(cashDividendFromEarningsPerShare(rows), eps);
  const nullReason: MetricNullReason | null = value !== null ? null : rows.length === 0 || eps === null ? 'missing_input' : 'zero_or_negative_denominator';
  const announced = rows.map((row) => row.announcementDate).filter((d): d is Date => d !== null);
  const knowledgeDate = [annual.anchor.knowledgeDate, ...announced].reduce((latest, d) => (d > latest ? d : latest));
  return computation({
    symbol,
    metricCode: 'dividendPayoutRatio',
    fiscalYear: annual.fiscalYear,
    fiscalQuarter: 4,
    dataType,
    subsidiaryCompanyId,
    ...periodTypeGroup('FY'),
    value,
    nullReason,
    knowledgeDate,
    knowledgeDateIsFallback: annual.anchor.isFallback,
  });
};
