import { resolveQuarterOrLatest } from '@/application/financials/latestQuarter';
import { rocYearToGregorian } from '@/domain/calendar/rocQuarter';
import type { QuarterlyMetricQuery } from '@/domain/financials/quarterlyMetric';
import { resolveKnowledgeDate } from '../../knowledgeDate';
import type { MetricNullReason } from '../../../../domain/metrics/metricBasis';
import { type ComputationBatch, noQuarterBatch, periodSlot, withFormulaVersion } from '@/domain/metrics/computation';
import type { PitDeps } from '@/application/metrics/deps';

// 2026-09-26 formulaVersion 2：流通股數改為 IAS 33 流通在外普通股（已發行 − 特別股 − 庫藏股），EPS 類分子扣特別股股利、
// 每股淨值類分子扣特別股股本；讀股數或市值的指標一起跳版，讓下游有訊號知道值變了（使用者 2026-09-26 拍板）。
// 2026-09-27 formulaVersion 3：跨期比較的每股數字做面額還原（股票分割不算每股價值變化，IAS 33 追溯調整前期；使用者：「盡可能反映內在價值的變化」）。
// 2026-09-28 formulaVersion 4：跨期還原加上股票股利（配股）與股數合併式減資（使用者：「只是股數變了、公司價值沒變」的都換算，IAS 33 對配股、分割、反分割都追溯調整）。
export const CHOWDER_NUMBER_FORMULA_VERSION = 4;

// Chowder Number（Seeking Alpha 社群規則）= 現金殖利率 + 股利五年成長率，門檻 ≥12%（公用
// 事業 8%）——門檻本身只記在這裡的說明供對照，不做「通過/不通過」判定（平台不自產「便宜/
// 安全/通過」這類判讀，只回傳原始數字，見指標矩陣文件的平台原則）。
//
// 兩個成分都獨立重新計算，不依賴 dividendYield/dividendGrowthRate5y 兩個 metric_code
// 已寫入的值：
// - 殖利率沿用 dividendYield 的資料源（TWSE/TPEx 官方每日公布，export.daily_valuation.
//   dividend_yield passthrough），取 knowledge_date 當天或之前最近一筆。
// - 股利五年成長率沿用 dividendGrowthRate/computeDividendGrowthRateFamilyPit.ts 同一套
//   現金流量近似邏輯（variant_of，不是精確宣告股利，見那個檔案的說明），這裡重新算一次
//   5 年版本，不是讀已寫入的 dividendGrowthRate5y。
//
// 任一成分缺漏（殖利率查無資料，或五年成長率資料不足）整體視為缺漏，不用「補 0」讓
// Chowder Number 看起來算得出來——那會低估真實情況（漏掉的那一半可能是負值也可能是正值，
// 不該假設是 0）。

const DIVIDEND_GROWTH_LOOKBACK_YEARS = 5;


// 2026-09-10：dps 之外額外回傳逐季明細（原本算完就丟掉），給
// getChowderNumberProvenance.ts（GET /companies/:symbol/metric-provenance 的
// chowderNumber 試點）用；寫入路徑（computeAndWriteChowderNumberPit）本身行為
// 不變，只是多讀一個欄位（.dps）。
export interface AnnualDividendPerShareProxyResult {
  dps: number | null;
  quarters: { rocYear: number; season: number; dividendsPaid: bigint | null; dividendsPaidFieldKey: string | null }[];
  shares: { reportDate: Date; outstandingCommonShares: bigint } | null;
}

// 面額還原：每一年的每股數字都換算到「所有已知面額變更之後」的股數基準，CAGR 比的是兩年比值，基準日選哪天都會抵銷。
// 每次呼叫才建立（模組載入時建的 Date 常數在錄製器凍結 Date 之後會被當成非 Date 編碼，cassette 對不上）。
const splitRestateBasis = (): Date => new Date(Date.UTC(9999, 0, 1));
export const getAnnualDividendPerShareProxy = async (
  symbol: string,
  rocYear: number,
  dataType: string,
  subsidiaryCompanyId: string,
  deps: ChowderNumberDeps
): Promise<AnnualDividendPerShareProxyResult> => {
  const quarterRecords = await Promise.all(
    [1, 2, 3, 4].map((quarter) => deps.statements.getCashFlowStatement({ symbol, year: rocYear, quarter, dataType, subsidiaryCompanyId }))
  );
  const quarters = quarterRecords.map((record, i) => ({
    rocYear,
    season: i + 1,
    dividendsPaid: record?.dividendsPaid ?? null,
    dividendsPaidFieldKey: record?.dividendsPaidFieldKey ?? null,
  }));

  // 2026-09-22 mops-ts 確認單季現金流量表的語意：該季有整份表但 dividends_paid_financing 為 null = 「本年度到這季為止還沒付過股利」
  // （台股多在 Q3 付款，Q1/Q2 的累計表根本沒這行），不是缺資料——所以只有整季報表缺席才算不齊，科目 null 視為 0。
  if (quarterRecords.some((q) => q === null)) {
    return { dps: null, quarters, shares: null };
  }

  const yearSum = quarterRecords.reduce((sum, q) => sum + (q!.dividendsPaid ?? 0n), 0n);
  const dividendsPaidAbs = yearSum < 0n ? -yearSum : yearSum;
  const q4ReportDate = quarterRecords[3]!.reportDate;
  const shares = await deps.shares.getOutstandingCommonShares(symbol, q4ReportDate);
  if (!shares) return { dps: null, quarters, shares: null };

  const splitFactor = await deps.shares.getShareSplitFactor(symbol, q4ReportDate, splitRestateBasis());
  return { dps: (Number(dividendsPaidAbs) * 1000) / Number(shares.outstandingCommonShares) / splitFactor, quarters, shares: { reportDate: q4ReportDate, outstandingCommonShares: shares.outstandingCommonShares } };
};

export type ChowderNumberDeps = Pick<PitDeps, 'statements' | 'quarters' | 'announcements' | 'shares' | 'market'>;

export type ChowderNumberComputationBatch = ComputationBatch<'fy'>;

export const computeChowderNumber = async (
  query: QuarterlyMetricQuery,
  deps: ChowderNumberDeps
): Promise<ChowderNumberComputationBatch> => {
  const { symbol, dataType, subsidiaryCompanyId } = query;

  const resolvedQuarter = await resolveQuarterOrLatest(query, ['cashFlowStatement'], deps.quarters);

  if (!resolvedQuarter) {
    return noQuarterBatch(symbol, ['fy']);
  }

  const { year, season } = resolvedQuarter;
  const rocYear = Number(year);
  const seasonNum = Number(season);
  const fiscalYear = rocYearToGregorian(rocYear);

  const mainCashFlow = await deps.statements.getCashFlowStatement({ symbol, year: rocYear, quarter: seasonNum, dataType, subsidiaryCompanyId });
  const mainAnchor = await resolveKnowledgeDate(symbol, [{ rocYear, season: seasonNum, reportDate: mainCashFlow?.reportDate ?? null }], deps.announcements);

  const dailyValuation = mainAnchor ? await deps.market.getDailyValuation(symbol, mainAnchor.knowledgeDate) : null;
  const dividendYieldPct = dailyValuation?.dividendYield ?? null;

  const latestCompleteFiscalYear = seasonNum === 4 ? rocYear : rocYear - 1;
  const [currentProxy, priorProxy] = await Promise.all([
    getAnnualDividendPerShareProxy(symbol, latestCompleteFiscalYear, dataType, subsidiaryCompanyId, deps),
    getAnnualDividendPerShareProxy(symbol, latestCompleteFiscalYear - DIVIDEND_GROWTH_LOOKBACK_YEARS, dataType, subsidiaryCompanyId, deps),
  ]);
  const currentDps = currentProxy.dps;
  const priorDps = priorProxy.dps;

  const dividendGrowthRatePct =
    currentDps !== null && priorDps !== null && priorDps > 0
      ? Math.round((Math.pow(currentDps / priorDps, 1 / DIVIDEND_GROWTH_LOOKBACK_YEARS) - 1) * 100 * 100) / 100
      : null;

  const chowderNumber = dividendYieldPct !== null && dividendGrowthRatePct !== null ? Math.round((dividendYieldPct + dividendGrowthRatePct) * 100) / 100 : null;

  let nullReason: MetricNullReason | null = null;
  if (chowderNumber === null) {
    nullReason = dividendYieldPct === null || currentDps === null || priorDps === null ? 'insufficient_history' : 'missing_input';
  }

  const coordinateBase = { symbol, metricCode: 'chowderNumber', fiscalYear, fiscalQuarter: seasonNum, dataType, subsidiaryCompanyId };

  const fy = periodSlot(mainAnchor, coordinateBase, 'FY', chowderNumber, nullReason);

  return { symbol, rocYear: year, season, slots: withFormulaVersion({ fy }, CHOWDER_NUMBER_FORMULA_VERSION) };
};
