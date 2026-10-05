import { resolveQuarterOrLatest } from '@/application/financials/latestQuarter';
import { determineNullReason, toPercent } from '@/domain/metrics/shared/numericHelpers';
import { pickNetIncomeWithFieldKey as pickNetIncome } from '@/domain/metrics/shared/pickers';
import { rocYearToGregorian, type Season } from '@/domain/calendar/rocQuarter';
import type { QuarterlyMetricQuery } from '@/domain/financials/quarterlyMetric';
import { resolveKnowledgeDate } from '../../knowledgeDate';
import type { MetricNullReason } from '../../../../domain/metrics/metricBasis';
import { periodTypeGroup } from '@/domain/metrics/coordinate';
import { computation, isComputationSkip, type ComputationBatch, type ComputationSlot, noQuarterBatch, periodSlot } from '@/domain/metrics/computation';
import type { PitDeps } from '@/application/metrics/deps';
import { resolveTrailingIncomeStatements } from '@/application/metrics/shared/trailingYear';
import { resolveAverageBalances } from '../../shared/averageBalances';
import { annualReportSlot, resolveAnnualReportContext, type AnnualReportContext } from '../../shared/annualReportSlot';
import type { CalcResult } from '@/domain/metrics/shared/numericHelpers';

// 這份檔案是 src/domainMetrics/roa.ts 的獨立重新實作，刻意不 import 它的（未 export 的）
// 私有函式，也不呼叫 calculateRoa() 本身——跟 src/domainPitMetrics/profitability/roe/computeRoePit.ts 同一種
// 「保持新管線對舊系統唯讀」原則。tests/domainPitMetrics/roaPit.test.ts 拿 roa.test.ts 的既有
// 基準數字交叉驗證。

// 分子/分母任一為 null 視為缺輸入；兩者皆非 null 但分母為 0 才是「分母為零」——總資產為負
// 仍然算得出一個（可能扭曲的）實際數字，不算 null（跟 roa.ts 現有對外行為一致）。

export type RoaDeps = Pick<PitDeps, 'statements' | 'quarters' | 'announcements' | 'cumulativeStatements'>;

// 2026-09-22 formulaVersion 2：分母改期間平均總資產（Q 兩點、TTM 5 點），跟 roe 同一次改版，見 shared/averageBalances.ts。
export const ROA_FORMULA_VERSION = 2;

export type RoaComputationBatch = ComputationBatch<'q' | 'ttm' | 'fy'>;

// 2026-10-05 年度版（FY）：照財報編製準則的財務分析公式〔稅後損益＋利息費用×(1−稅率)〕÷平均資產總額，使用者要求先用官方數字校準。
// 對照組＝MOPS 財務分析（t51sb02，mops-ts 抓回上市＋上櫃 110~114 全部），tmp/roaCalibrate.ts 逐家試變體（排除每股盈餘跟官方對不上的公司）：
//   114 年度 1,865 家：財務成本×(1−20%) 完全一致 81.5%（差≤0.1pp 再 8.2%）；利息費用×(1−20%) 62.1%；財務成本×(1−有效稅率) 45.4%；
//   利息費用×(1−有效稅率) 37.6%；不加回利息 11.0%。113 年度同樣排序（財務成本×0.8 81.8%）。
// 所以「利息費用」實際對應 XBRL 的財務成本（mops-ts 量到 interest_expense 與 finance_costs 43% 公司不相等，用 interest_expense 反而對不上），
// 稅率用法定 20%。稅後損益用本期淨利總額（跟 ROE、稅後淨利率年度版同一個「對齊官方」原則）；分母是年初、年底兩點平均。
// ponytail: 剩約 10% 解釋不了（換分母、換淨利口徑、改個體報表都只解釋幾十家，像巧合），多數差 0.03~0.1pp；
// 要追的話先跟 mops-ts 要 t51sb02 頁面上的原始分子分母（如果頁面有揭露）。
export const STATUTORY_TAX_RATE_PCT = 20n;
export const calculateAnnualRoa = (netIncome: bigint | null, financeCosts: bigint | null, openingAssets: bigint | null, closingAssets: bigint | null): CalcResult => {
  if (netIncome === null || closingAssets === null) return { value: null, nullReason: 'missing_input' };
  if (openingAssets === null) return { value: null, nullReason: 'insufficient_history' };
  const average = (openingAssets + closingAssets) / 2n;
  const numerator = netIncome + ((financeCosts ?? 0n) * (100n - STATUTORY_TAX_RATE_PCT)) / 100n;
  const value = toPercent(numerator, average);
  return { value, nullReason: value === null ? determineNullReason(numerator, average) : null };
};

const resolveAnnualRoa = async (annual: AnnualReportContext | null, key: { symbol: string; dataType: string; subsidiaryCompanyId: string }, deps: RoaDeps): Promise<CalcResult> => {
  if (!annual) return { value: null, nullReason: 'missing_input' };
  const rocYear = annual.fiscalYear - 1911;
  const [opening, closing] = await Promise.all(
    [rocYear - 1, rocYear].map((year) => deps.statements.getBalanceSheet({ symbol: key.symbol, year, quarter: 4, dataType: key.dataType, subsidiaryCompanyId: key.subsidiaryCompanyId }))
  );
  return calculateAnnualRoa(annual.annual.netIncome ?? annual.annual.netIncomeAttributableToParent, annual.annual.financeCosts, opening?.totalAssets ?? null, closing?.totalAssets ?? null);
};

export type RoaComputeDeps = RoaDeps & Pick<PitDeps, 'annualReports' | 'shares'>;

// 2026-10-01 抽出 resolveRoaData()：溯源表（getRoaProvenance.ts）跟 compute 走同一份資料與計算，分母（平均總資產）不會再
// 各算各的——溯源表原本自己算本季期末總資產，2026-09-22 分母改平均後就跟儲存值對不上（roa 上市 20 家只對 1 家）。
export const resolveRoaData = async (query: QuarterlyMetricQuery, deps: RoaDeps) => {
  const { symbol, dataType, subsidiaryCompanyId } = query;

  const resolvedQuarter = await resolveQuarterOrLatest(query, ['balanceSheet', 'incomeStatement'], deps.quarters);

  if (!resolvedQuarter) return null;

  const { year, season } = resolvedQuarter;
  const rocYear = Number(year);
  const seasonNum = Number(season);
  const fiscalYear = rocYearToGregorian(rocYear);

  const key = { symbol, year: rocYear, quarter: seasonNum, dataType, subsidiaryCompanyId };
  const [incomeStatement, balanceSheet] = await Promise.all([deps.statements.getIncomeStatement(key), deps.statements.getBalanceSheet(key)]);

  const netIncome = pickNetIncome(incomeStatement);
  const totalAssets = balanceSheet?.totalAssets ?? null;
  const balances = await resolveAverageBalances({ symbol, rocYear, season: season as Season, dataType, subsidiaryCompanyId }, deps);

  const roaQuarterlyPct = netIncome.value !== null && balances.assetsAvgQ !== null ? toPercent(netIncome.value, balances.assetsAvgQ) : null;
  const quarterlyNullReason: MetricNullReason | null =
    roaQuarterlyPct !== null ? null : netIncome.value !== null && totalAssets !== null && balances.assetsAvgQ === null ? 'insufficient_history' : determineNullReason(netIncome.value, balances.assetsAvgQ ?? totalAssets);

  const reportDate = balanceSheet?.reportDate ?? incomeStatement?.reportDate ?? null;

  // TTM：近四季（含本季）淨利加總 / 近四季窗口 5 個季末總資產平均。邏輯跟 computeRoePit.ts 的 TTM 處理一致，
  // 見那份檔案的說明——四季不齊時仍寫一列 value=null/insufficient_history，knowledge_date
  // 沿用本季（Q）自己的。
  // 2026-10-01 近一年改走共用來源（興櫃半年頻，見 shared/trailingYear.ts）。
  const trailing = await resolveTrailingIncomeStatements({ symbol, rocYear, season: season as Season, dataType, subsidiaryCompanyId }, deps);
  const ttmQuarters = trailing.periods;
  const ttmRecords = trailing.periods.map((p) => p.record);
  const ttmNetIncomes = ttmRecords.map(pickNetIncome);

  let ttmSum = 0n;
  let ttmComplete = true;
  for (const picked of ttmNetIncomes) {
    if (picked.value === null) {
      ttmComplete = false;
    } else {
      ttmSum += picked.value;
    }
  }

  const roaTtmPct = ttmComplete && balances.assetsAvgTtm !== null ? toPercent(ttmSum, balances.assetsAvgTtm) : null;
  const ttmNullReason: MetricNullReason | null = roaTtmPct !== null ? null : ttmComplete && balances.assetsAvgTtm !== null ? determineNullReason(ttmSum, balances.assetsAvgTtm) : 'insufficient_history';

  return { symbol, year, season, rocYear, seasonNum, fiscalYear, balances, roaQuarterlyPct, quarterlyNullReason, reportDate, basis: trailing.basis, ttmQuarters, ttmRecords, ttmNetIncomes, ttmComplete, roaTtmPct, ttmNullReason };
};

export const computeRoa = async (query: QuarterlyMetricQuery, deps: RoaComputeDeps): Promise<RoaComputationBatch> => {
  const { symbol, dataType, subsidiaryCompanyId } = query;

  const resolution = await resolveRoaData(query, deps);
  if (!resolution) return noQuarterBatch(symbol, ['q', 'ttm', 'fy']);

  const { year, season, rocYear, seasonNum, fiscalYear, roaQuarterlyPct, quarterlyNullReason, reportDate, ttmQuarters, ttmRecords, ttmComplete, roaTtmPct, ttmNullReason } = resolution;
  const mainAnchor = await resolveKnowledgeDate(symbol, [{ rocYear, season: seasonNum, reportDate }], deps.announcements);

  const coordinateBase = {
    symbol,
    metricCode: 'roa',
    fiscalYear,
    fiscalQuarter: seasonNum,
    dataType,
    subsidiaryCompanyId,
  };

  const versioned = (slot: ComputationSlot): ComputationSlot => (isComputationSkip(slot) ? slot : { ...slot, formulaVersion: ROA_FORMULA_VERSION });
  const q = versioned(periodSlot(mainAnchor, coordinateBase, 'Q', roaQuarterlyPct, quarterlyNullReason));

  let ttm: ComputationSlot;
  if (ttmComplete) {
    const ttmAnchor = await resolveKnowledgeDate(
      symbol,
      ttmQuarters.map((tq, i) => ({ rocYear: Number(tq.year), season: Number(tq.season), reportDate: ttmRecords[i]?.reportDate ?? null })), deps.announcements
    );
    if (!ttmAnchor) {
      ttm = { action: 'skipped_no_knowledge_date' };
    } else {
      ttm = computation({
        ...coordinateBase,
        ...periodTypeGroup('TTM'),
        value: roaTtmPct,
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

  const annual = await resolveAnnualReportContext({ symbol, rocYear, season: seasonNum, dataType, subsidiaryCompanyId }, deps);
  const fy = annualReportSlot(annual, { symbol, metricCode: 'roa', dataType, subsidiaryCompanyId }, await resolveAnnualRoa(annual, { symbol, dataType, subsidiaryCompanyId }, deps));

  return { symbol, rocYear: year, season, slots: { q, ttm: versioned(ttm), fy } };
};
