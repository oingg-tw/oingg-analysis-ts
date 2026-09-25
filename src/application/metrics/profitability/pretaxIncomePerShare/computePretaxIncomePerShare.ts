import { resolveQuarterOrLatest } from '@/application/financials/latestQuarter';
import { determineNullReason, toPerShare } from '@/domain/metrics/shared/numericHelpers';
import { getPastNQuarters, rocYearToGregorian, type Season } from '@/domain/calendar/rocQuarter';
import type { QuarterlyMetricQuery } from '@/domain/financials/quarterlyMetric';
import { resolveKnowledgeDate } from '../../knowledgeDate';
import type { MetricNullReason } from '../../../../domain/metrics/metricBasis';
import { periodTypeGroup } from '@/domain/metrics/coordinate';
import { computation, type ComputationBatch, type ComputationSlot, noQuarterBatch, periodSlot } from '@/domain/metrics/computation';
import type { PitDeps } from '@/application/metrics/deps';
import { annualReportSlot, resolveAnnualReportContext } from '@/application/metrics/shared/annualReportSlot';

// 2026-09-15 應 web-nuxt「營收到股利去了哪裡」瀑布圖卡片需求新增——跟 computeEpsPit.ts
// 幾乎同一種形狀，差別只在分子用 profitBeforeTax（稅前淨利，不分歸屬母公司/整體口徑，
// 損益表本來就只有一個稅前淨利欄位）取代 pickNetIncome()。三張季度財報表金額單位是
// 「千元」，流通股數是實際股數，分子要先 x1000 換算成元（跟 eps 一致）。


// 2026-09-18 補上銀行業 fallback：一般損益表（quarterly_income_statement_xbrl）跟銀行監理
// 專用損益表（bank_income_statement_detail_xbrl）申報進度不一定同步，實測 113Q3~115Q2、
// 10 家銀行/金控有 24 筆季度組合是一般表缺資料、銀行專用表卻有——這條指標是銀行業「營收到
// 股利去了哪裡」瀑布圖的終點（跟 bankOtherOperatingExpensePerShare 等 4 個銀行專用欄位對齊），
// 一般表缺資料時退回銀行專用表的稅前淨利。兩邊有資料時數字完全一致（同一份文件的同一個數字，
// 見 BankIncomeStatementFields.profitBeforeTax 的說明），不是另一個口徑的替代值。非銀行公司
// 這張表本來就沒有資料，fallback 對他們是 no-op——用 isFinancialIndustryCompany 先擋掉，
// 避免全市場 2000+ 家非銀行公司每季都多打一次注定查無資料的查詢。

export type PretaxIncomePerShareDeps = Pick<PitDeps, 'statements' | 'annualReports' | 'quarters' | 'announcements' | 'shares' | 'industry'>;

// 一般損益表優先，缺資料時（且是銀行/金控）才查銀行監理專用表——見上方 2026-09-18 說明。
const resolveProfitBeforeTax = async (
  key: { symbol: string; year: number; quarter: number; dataType: string; subsidiaryCompanyId: string },
  isBank: boolean,
  deps: Pick<PretaxIncomePerShareDeps, 'statements'>
): Promise<{ profitBeforeTax: bigint | null; reportDate: Date | null }> => {
  const incomeStatement = await deps.statements.getIncomeStatement(key);
  if (incomeStatement?.profitBeforeTax != null) {
    return { profitBeforeTax: incomeStatement.profitBeforeTax, reportDate: incomeStatement.reportDate };
  }
  if (!isBank) {
    return { profitBeforeTax: null, reportDate: incomeStatement?.reportDate ?? null };
  }
  const bankIncomeStatement = await deps.statements.getBankIncomeStatement(key);
  if (bankIncomeStatement?.profitBeforeTax != null) {
    return { profitBeforeTax: bankIncomeStatement.profitBeforeTax, reportDate: incomeStatement?.reportDate ?? bankIncomeStatement.reportDate };
  }
  return { profitBeforeTax: null, reportDate: incomeStatement?.reportDate ?? null };
};

export type PretaxIncomePerShareComputationBatch = ComputationBatch<'q' | 'ttm' | 'fy'>;

export const computePretaxIncomePerShare = async (
  query: QuarterlyMetricQuery,
  deps: PretaxIncomePerShareDeps
): Promise<PretaxIncomePerShareComputationBatch> => {
  const { symbol, dataType, subsidiaryCompanyId } = query;

  const resolvedQuarter = await resolveQuarterOrLatest(query, ['incomeStatement'], deps.quarters);

  if (!resolvedQuarter) {
    return noQuarterBatch(symbol, ['q', 'ttm', 'fy']);
  }

  const { year, season } = resolvedQuarter;
  const rocYear = Number(year);
  const seasonNum = Number(season);
  const fiscalYear = rocYearToGregorian(rocYear);

  const isBank = await deps.industry.isFinancialIndustryCompany(symbol);

  const key = { symbol, year: rocYear, quarter: seasonNum, dataType, subsidiaryCompanyId };
  const { profitBeforeTax, reportDate } = await resolveProfitBeforeTax(key, isBank, deps);

  // 流通股數固定用「本季報告日」當下有效的股本，Q/TTM 共用同一個股數（跟 eps 一致）。
  const shares = reportDate ? await deps.shares.getPaidInShares(symbol, reportDate) : null;
  const sharesValue = shares?.paidInShares ?? null;

  const pretaxIncomePerShareQuarterly = profitBeforeTax !== null && sharesValue !== null ? toPerShare(profitBeforeTax, sharesValue) : null;
  const quarterlyNullReason: MetricNullReason | null = pretaxIncomePerShareQuarterly === null ? determineNullReason(profitBeforeTax, sharesValue) : null;

  const mainAnchor = await resolveKnowledgeDate(symbol, [{ rocYear, season: seasonNum, reportDate }], deps.announcements);

  const coordinateBase = { symbol, metricCode: 'pretaxIncomePerShare', fiscalYear, fiscalQuarter: seasonNum, dataType, subsidiaryCompanyId };

  const q = periodSlot(mainAnchor, coordinateBase, 'Q', pretaxIncomePerShareQuarterly, quarterlyNullReason);

  // TTM：近四季（含本季）稅前淨利加總 / 流通股數。四季不齊時仍寫一列 value=null/insufficient_history，
  // knowledge_date 沿用本季（Q）自己的，跟 computeEpsPit.ts 的 TTM 處理一致。
  const ttmQuarters = getPastNQuarters({ rocYear, season: season as Season }, 4);
  const ttmRecords = await Promise.all(
    ttmQuarters.map((tq) => resolveProfitBeforeTax({ symbol, year: Number(tq.year), quarter: Number(tq.season), dataType, subsidiaryCompanyId }, isBank, deps))
  );

  let ttmSum = 0n;
  let ttmComplete = true;
  for (const record of ttmRecords) {
    if (record.profitBeforeTax === null) {
      ttmComplete = false;
    } else {
      ttmSum += record.profitBeforeTax;
    }
  }

  const pretaxIncomePerShareTtm = ttmComplete && sharesValue !== null ? toPerShare(ttmSum, sharesValue) : null;
  const ttmNullReason: MetricNullReason | null = pretaxIncomePerShareTtm !== null ? null : ttmComplete ? determineNullReason(ttmSum, sharesValue) : 'insufficient_history';

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
        value: pretaxIncomePerShareTtm,
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

  // FY（2026-09-25）：年報稅前淨利 ÷ 反推的全年加權平均股數（shared/annualReportSlot.ts）。年報只讀一般損益表，
  // 沒有銀行專用表 fallback——那個 fallback 補的是「兩張季表申報進度不同步」，年報沒有這個問題。
  const annual = await resolveAnnualReportContext({ symbol, rocYear, season: seasonNum, dataType, subsidiaryCompanyId }, deps);
  const annualPretax = annual?.annual.profitBeforeTax ?? null;
  const annualShares = annual?.weightedShares ?? null;
  const fyValue = annualPretax !== null && annualShares !== null ? toPerShare(annualPretax, annualShares) : null;
  const fy = annualReportSlot(
    annual,
    { symbol, metricCode: 'pretaxIncomePerShare', dataType, subsidiaryCompanyId },
    { value: fyValue, nullReason: fyValue === null ? determineNullReason(annualPretax, annualShares) : null }
  );

  return { symbol, rocYear: year, season, slots: { q, ttm, fy } };
};
