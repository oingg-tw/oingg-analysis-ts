import { resolveQuarterOrLatest } from '@/application/financials/latestQuarter';
import { toMultipleFromThousands } from '@/domain/metrics/shared/numericHelpers';
import { rocYearToGregorian, type Season } from '@/domain/calendar/rocQuarter';
import type { QuarterlyMetricQuery } from '@/domain/financials/quarterlyMetric';
import { resolveKnowledgeDate } from '../../knowledgeDate';
import type { MetricNullReason } from '../../../../domain/metrics/metricBasis';
import { periodTypeGroup } from '@/domain/metrics/coordinate';
import { computation, type ComputationBatch, type ComputationSlot, noQuarterBatch, withFormulaVersion } from '@/domain/metrics/computation';
import { interestBearingDebt } from '@/domain/metrics/shared/pickers';
import type { PitDeps } from '@/application/metrics/deps';
import { resolveTrailingCashFlowStatements, resolveTrailingIncomeStatements } from '@/application/metrics/shared/trailingYear';

// 2026-09-26 formulaVersion 2：流通股數改為 IAS 33 流通在外普通股（已發行 − 特別股 − 庫藏股），EPS 類分子扣特別股股利、
// 每股淨值類分子扣特別股股本；讀股數或市值的指標一起跳版，讓下游有訊號知道值變了（使用者 2026-09-26 拍板）。
// 2026-09-28 formulaVersion 3：有息負債補上一年內到期長期負債與應付短期票券（使用者拍板「共用負債補到期」，見 domain/metrics/shared/pickers.ts interestBearingDebt）。
export const EV_EBITDA_FORMULA_VERSION = 3;

// 這份檔案是 src/domainMetrics/evEbitda.ts 的獨立重新實作——舊架構呼叫
// calculateNetDebtToEbitda()，這裡不依賴 netDebtToEbitda 這個 metric_code 已寫入的值，
// 自己重新查三張表算淨負債+EBITDA（公式在 computeNetDebtToEbitdaPit.ts 跟這裡各自重複一次，
// 延續舊架構本身在 interestCoverage/netDebtToEbitda/roic/roce 四個檔案各自重複定義 EBIT
// 的既有慣例）。市值查詢邏輯跟 psr/pFcf 一致。沒有單季非年化版本。


export type EvEbitdaDeps = Pick<PitDeps, 'statements' | 'quarters' | 'announcements' | 'market' | 'cumulativeStatements'>;

export type EvEbitdaComputationBatch = ComputationBatch<'ttm'>;

export const computeEvEbitda = async (
  query: QuarterlyMetricQuery,
  deps: EvEbitdaDeps
): Promise<EvEbitdaComputationBatch> => {
  const { symbol, dataType, subsidiaryCompanyId } = query;

  const resolvedQuarter = await resolveQuarterOrLatest(query, ['balanceSheet', 'incomeStatement', 'cashFlowStatement'], deps.quarters);

  if (!resolvedQuarter) {
    return noQuarterBatch(symbol, ['ttm']);
  }

  const { year, season } = resolvedQuarter;
  const rocYear = Number(year);
  const seasonNum = Number(season);
  const fiscalYear = rocYearToGregorian(rocYear);

  const key = { symbol, year: rocYear, quarter: seasonNum, dataType, subsidiaryCompanyId };
  const [balanceSheet, incomeStatement, cashFlowStatement] = await Promise.all([
    deps.statements.getBalanceSheet(key),
    deps.statements.getIncomeStatement(key),
    deps.statements.getCashFlowStatement(key),
  ]);

  const totalDebt = balanceSheet
    ? interestBearingDebt(balanceSheet)
    : null;
  const cashAndEquivalents = balanceSheet?.cashAndEquivalents ?? null;
  const netDebt = totalDebt !== null && cashAndEquivalents !== null ? totalDebt - cashAndEquivalents : null;

  const reportDate = balanceSheet?.reportDate ?? incomeStatement?.reportDate ?? cashFlowStatement?.reportDate ?? null;

  const mainAnchor = await resolveKnowledgeDate(symbol, [{ rocYear, season: seasonNum, reportDate }], deps.announcements);
  const marketCap = mainAnchor ? await deps.market.getMarketCap(symbol, mainAnchor.knowledgeDate) : null;
  const enterpriseValue = marketCap !== null && netDebt !== null ? marketCap.marketCap + Number(netDebt) * 1000 : null;

  const coordinateBase = { symbol, metricCode: 'evEbitda', fiscalYear, fiscalQuarter: seasonNum, dataType, subsidiaryCompanyId };

  // TTM：近四季（含本季）EBITDA 加總；企業價值（市值+淨負債）沿用上面同一筆，不另外重查。
  // 2026-10-01 近一年改走共用來源（興櫃半年頻，見 shared/trailingYear.ts）；兩張表的 periods 順序相同、逐段配對。
  const trailingKey = { symbol, rocYear, season: season as Season, dataType, subsidiaryCompanyId };
  const [trailingIncome, trailingCashFlow] = await Promise.all([resolveTrailingIncomeStatements(trailingKey, deps), resolveTrailingCashFlowStatements(trailingKey, deps)]);
  const ttmQuarters = trailingIncome.periods;
  const ttmRecords = trailingIncome.periods.map((p, i) => [p.record, trailingCashFlow.periods[i]?.record ?? null] as const);

  let ebitdaTtmSum = 0n;
  let ttmComplete = true;
  for (const [incomeRecord, cashFlowRecord] of ttmRecords) {
    if (
      incomeRecord === null ||
      cashFlowRecord === null ||
      incomeRecord.profitBeforeTax === null ||
      incomeRecord.financeCosts === null ||
      cashFlowRecord.depreciation === null ||
      cashFlowRecord.amortization === null
    ) {
      ttmComplete = false;
    } else {
      ebitdaTtmSum += incomeRecord.profitBeforeTax + incomeRecord.financeCosts + cashFlowRecord.depreciation + cashFlowRecord.amortization;
    }
  }

  const ttmValue = ttmComplete && enterpriseValue !== null ? toMultipleFromThousands(enterpriseValue, ebitdaTtmSum) : null;
  const ttmNullReason: MetricNullReason | null = ttmValue !== null ? null : ttmComplete ? (enterpriseValue === null ? 'missing_input' : 'zero_or_negative_denominator') : 'insufficient_history';

  let ttm: ComputationSlot;
  if (ttmComplete) {
    const ttmAnchor = await resolveKnowledgeDate(
      symbol,
      ttmQuarters.map((tq, i) => ({ rocYear: Number(tq.year), season: Number(tq.season), reportDate: ttmRecords[i]![0]?.reportDate ?? null })), deps.announcements
    );
    if (!ttmAnchor) {
      ttm = { action: 'skipped_no_knowledge_date' };
    } else {
      ttm = computation({
        ...coordinateBase,
        ...periodTypeGroup('TTM'),
        value: ttmValue,
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

  return { symbol, rocYear: year, season, slots: withFormulaVersion({ ttm }, EV_EBITDA_FORMULA_VERSION) };
};
