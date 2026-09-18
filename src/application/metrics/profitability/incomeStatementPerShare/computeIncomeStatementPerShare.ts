import { resolveQuarterOrLatest } from '@/application/financials/latestQuarter';
import { getPastNQuarters, rocYearToGregorian, type Season } from '@/domain/calendar/rocQuarter';
import type { QuarterlyMetricQuery } from '@/domain/financials/quarterlyMetric';
import { resolveKnowledgeDate } from '../../knowledgeDate';
import { calculateGrossProfitPerShare } from '@/domain/metrics/profitability/grossProfitPerShare/calculateGrossProfitPerShare';
import { calculateOperatingIncomePerShare } from '@/domain/metrics/profitability/operatingIncomePerShare/calculateOperatingIncomePerShare';
import { calculateCostOfGoodsSoldPerShare } from '@/domain/metrics/profitability/costOfGoodsSoldPerShare/calculateCostOfGoodsSoldPerShare';
import { calculateOperatingExpensePerShare } from '@/domain/metrics/profitability/operatingExpensePerShare/calculateOperatingExpensePerShare';
import { calculateIncomeTaxExpensePerShare } from '@/domain/metrics/profitability/incomeTaxExpensePerShare/calculateIncomeTaxExpensePerShare';
import { periodTypeGroup } from '@/domain/metrics/coordinate';
import { computation, type ComputationBatch, type ComputationSlot, noQuarterBatch } from '@/domain/metrics/computation';
import type { PitDeps } from '@/application/metrics/deps';

// 2026-09-15 應 web-nuxt「營收到股利去了哪裡」瀑布圖卡片需求新增——一次查詢損益表，
// 拆成兩個獨立 metric_code（grossProfitPerShare/operatingIncomePerShare），跟
// computeCashFlowPerSharePit.ts/computeDupontFamilyPit.ts 同一種「一次查詢、拆多個
// metric_code」模式。兩者都是損益表原始金額科目直接除以股數，不經過 margin 比率反推
// （grossMargin×revenuePerShare 這種算法會疊加 margin 欄位本身的捨入誤差），理由見
// 兩支各自 calculateXxx.ts 的說明。跟 eps 共用同一份 IncomeStatementPort 查詢，但
// 刻意不合併進 computeEpsPit.ts——eps 的淨利需要 pickNetIncome() 處理歸屬母公司/整體
// 口徑的挑選邏輯，毛利/營業利益是損益表單一欄位直接讀，沒有這層複雜度，合併只會讓
// eps.ts 多背一個它不需要的查詢分支。
//
// 2026-09-18 應 web-nuxt 需求擴充：同一次 getIncomeStatement 查詢再拆出 3 個 TTM-only 的
// metric_code（costOfGoodsSoldPerShare/operatingExpensePerShare/incomeTaxExpensePerShare），
// 直接讀損益表對應科目（operating_costs/operating_expense/income_tax_expense_continuing_
// operations），理由跟毛利/營業利益一致——不是用其他 per-share 欄位相減湊出來（那樣會疊加
// 捨入誤差，incomeTaxExpensePerShare 更是不能用 pretaxIncomePerShare − eps 湊，因為 eps 是
// 歸屬母公司口徑而稅前淨利−所得稅費用等於整體淨利，多數公司有非零少數股東權益會讓兩者不等價）。
// 這 3 個新欄位刻意跟既有的 grossProfit/operatingIncome 兩組欄位各自獨立判斷「四季齊不齊」跟
// 各自呼叫 resolveKnowledgeDate——不共用完整度判斷，避免新欄位的資料缺漏影響到已經上線指標的
// null 判定（parity 風險）。


export type IncomeStatementPerShareDeps = Pick<PitDeps, 'statements' | 'quarters' | 'announcements' | 'shares'>;

export type IncomeStatementPerShareComputationBatch = ComputationBatch<'grossProfitPerShareQ' | 'grossProfitPerShareTtm' | 'operatingIncomePerShareQ' | 'operatingIncomePerShareTtm' | 'costOfGoodsSoldPerShareTtm' | 'operatingExpensePerShareTtm' | 'incomeTaxExpensePerShareTtm'>;

export const computeIncomeStatementPerShare = async (
  query: QuarterlyMetricQuery,
  deps: IncomeStatementPerShareDeps
): Promise<IncomeStatementPerShareComputationBatch> => {
  const { symbol, dataType, subsidiaryCompanyId } = query;

  const skippedNoQuarter: IncomeStatementPerShareComputationBatch = noQuarterBatch(symbol, ['grossProfitPerShareQ', 'grossProfitPerShareTtm', 'operatingIncomePerShareQ', 'operatingIncomePerShareTtm', 'costOfGoodsSoldPerShareTtm', 'operatingExpensePerShareTtm', 'incomeTaxExpensePerShareTtm']);

  const resolvedQuarter = await resolveQuarterOrLatest(query, ['incomeStatement'], deps.quarters);

  if (!resolvedQuarter) return skippedNoQuarter;

  const { year, season } = resolvedQuarter;
  const rocYear = Number(year);
  const seasonNum = Number(season);
  const fiscalYear = rocYearToGregorian(rocYear);

  const key = { symbol, year: rocYear, quarter: seasonNum, dataType, subsidiaryCompanyId };
  const incomeStatement = await deps.statements.getIncomeStatement(key);
  const grossProfit = incomeStatement?.grossProfit ?? null;
  const operatingIncome = incomeStatement?.operatingIncome ?? null;
  const reportDate = incomeStatement?.reportDate ?? null;

  const shares = reportDate ? await deps.shares.getPaidInShares(symbol, reportDate) : null;
  const sharesValue = shares?.paidInShares ?? null;

  const grossProfitQuarterly = calculateGrossProfitPerShare(grossProfit, sharesValue);
  const operatingIncomeQuarterly = calculateOperatingIncomePerShare(operatingIncome, sharesValue);

  const mainAnchor = await resolveKnowledgeDate(symbol, [{ rocYear, season: seasonNum, reportDate }], deps.announcements);
  const coordinateFor = (metricCode: string) => ({ symbol, metricCode, fiscalYear, fiscalQuarter: seasonNum, dataType, subsidiaryCompanyId });

  let grossProfitPerShareQ: ComputationSlot;
  let operatingIncomePerShareQ: ComputationSlot;

  if (!mainAnchor) {
    grossProfitPerShareQ = { action: 'skipped_no_knowledge_date' };
    operatingIncomePerShareQ = { action: 'skipped_no_knowledge_date' };
  } else {
    const { knowledgeDate, isFallback: knowledgeDateIsFallback } = mainAnchor;
    grossProfitPerShareQ = computation({ ...coordinateFor('grossProfitPerShare'), ...periodTypeGroup('Q'), value: grossProfitQuarterly.value, nullReason: grossProfitQuarterly.nullReason, knowledgeDate, knowledgeDateIsFallback });
    operatingIncomePerShareQ = computation({ ...coordinateFor('operatingIncomePerShare'), ...periodTypeGroup('Q'), value: operatingIncomeQuarterly.value, nullReason: operatingIncomeQuarterly.nullReason, knowledgeDate, knowledgeDateIsFallback });
  }

  // TTM：近四季（含本季）加總。一季只要毛利或營業利益任一為 null 就視為該季不齊——
  // 兩個 metric_code 共用同一組「資料齊不齊」判斷（跟 cashFlowPerShare 的 OCF/FCF 一致）。
  const ttmQuarters = getPastNQuarters({ rocYear, season: season as Season }, 4);
  const ttmRecords = await Promise.all(
    ttmQuarters.map((tq) => deps.statements.getIncomeStatement({ symbol, year: Number(tq.year), quarter: Number(tq.season), dataType, subsidiaryCompanyId }))
  );

  let grossProfitTtmSum = 0n;
  let operatingIncomeTtmSum = 0n;
  let ttmComplete = true;
  for (const record of ttmRecords) {
    if (record === null || record.grossProfit === null || record.operatingIncome === null) {
      ttmComplete = false;
    } else {
      grossProfitTtmSum += record.grossProfit;
      operatingIncomeTtmSum += record.operatingIncome;
    }
  }

  const grossProfitPerShareTtmCalc = ttmComplete ? calculateGrossProfitPerShare(grossProfitTtmSum, sharesValue) : { value: null, nullReason: 'insufficient_history' as const };
  const operatingIncomePerShareTtmCalc = ttmComplete ? calculateOperatingIncomePerShare(operatingIncomeTtmSum, sharesValue) : { value: null, nullReason: 'insufficient_history' as const };

  let grossProfitPerShareTtm: ComputationSlot;
  let operatingIncomePerShareTtm: ComputationSlot;

  if (ttmComplete) {
    const ttmAnchor = await resolveKnowledgeDate(
      symbol,
      ttmQuarters.map((tq, i) => ({ rocYear: Number(tq.year), season: Number(tq.season), reportDate: ttmRecords[i]?.reportDate ?? null })), deps.announcements
    );
    if (!ttmAnchor) {
      grossProfitPerShareTtm = { action: 'skipped_no_knowledge_date' };
      operatingIncomePerShareTtm = { action: 'skipped_no_knowledge_date' };
    } else {
      const { knowledgeDate, isFallback: knowledgeDateIsFallback } = ttmAnchor;
      grossProfitPerShareTtm = computation({ ...coordinateFor('grossProfitPerShare'), ...periodTypeGroup('TTM'), value: grossProfitPerShareTtmCalc.value, nullReason: grossProfitPerShareTtmCalc.nullReason, knowledgeDate, knowledgeDateIsFallback });
      operatingIncomePerShareTtm = computation({ ...coordinateFor('operatingIncomePerShare'), ...periodTypeGroup('TTM'), value: operatingIncomePerShareTtmCalc.value, nullReason: operatingIncomePerShareTtmCalc.nullReason, knowledgeDate, knowledgeDateIsFallback });
    }
  } else if (mainAnchor) {
    const { knowledgeDate, isFallback: knowledgeDateIsFallback } = mainAnchor;
    grossProfitPerShareTtm = computation({ ...coordinateFor('grossProfitPerShare'), ...periodTypeGroup('TTM'), value: null, nullReason: 'insufficient_history', knowledgeDate, knowledgeDateIsFallback });
    operatingIncomePerShareTtm = computation({ ...coordinateFor('operatingIncomePerShare'), ...periodTypeGroup('TTM'), value: null, nullReason: 'insufficient_history', knowledgeDate, knowledgeDateIsFallback });
  } else {
    grossProfitPerShareTtm = { action: 'skipped_no_knowledge_date' };
    operatingIncomePerShareTtm = { action: 'skipped_no_knowledge_date' };
  }

  // 2026-09-18 新增的 3 個 TTM-only 欄位——重用上面已經查好的 ttmRecords（同一份損益表資料），
  // 但獨立判斷「四季齊不齊」跟獨立呼叫 resolveKnowledgeDate，不影響 grossProfit/operatingIncome
  // 兩組既有欄位的 ttmComplete/ttmAnchor（見檔頭 2026-09-18 說明）。
  let costOfGoodsSoldTtmSum = 0n;
  let operatingExpenseTtmSum = 0n;
  let incomeTaxExpenseTtmSum = 0n;
  let expenseTtmComplete = true;
  for (const record of ttmRecords) {
    if (record === null || record.operatingCost === null || record.operatingExpense === null || record.incomeTaxExpense === null) {
      expenseTtmComplete = false;
    } else {
      costOfGoodsSoldTtmSum += record.operatingCost;
      operatingExpenseTtmSum += record.operatingExpense;
      incomeTaxExpenseTtmSum += record.incomeTaxExpense;
    }
  }

  const costOfGoodsSoldPerShareTtmCalc = expenseTtmComplete ? calculateCostOfGoodsSoldPerShare(costOfGoodsSoldTtmSum, sharesValue) : { value: null, nullReason: 'insufficient_history' as const };
  const operatingExpensePerShareTtmCalc = expenseTtmComplete ? calculateOperatingExpensePerShare(operatingExpenseTtmSum, sharesValue) : { value: null, nullReason: 'insufficient_history' as const };
  const incomeTaxExpensePerShareTtmCalc = expenseTtmComplete ? calculateIncomeTaxExpensePerShare(incomeTaxExpenseTtmSum, sharesValue) : { value: null, nullReason: 'insufficient_history' as const };

  let costOfGoodsSoldPerShareTtm: ComputationSlot;
  let operatingExpensePerShareTtm: ComputationSlot;
  let incomeTaxExpensePerShareTtm: ComputationSlot;

  if (expenseTtmComplete) {
    const expenseTtmAnchor = await resolveKnowledgeDate(
      symbol,
      ttmQuarters.map((tq, i) => ({ rocYear: Number(tq.year), season: Number(tq.season), reportDate: ttmRecords[i]?.reportDate ?? null })), deps.announcements
    );
    if (!expenseTtmAnchor) {
      costOfGoodsSoldPerShareTtm = { action: 'skipped_no_knowledge_date' };
      operatingExpensePerShareTtm = { action: 'skipped_no_knowledge_date' };
      incomeTaxExpensePerShareTtm = { action: 'skipped_no_knowledge_date' };
    } else {
      const { knowledgeDate, isFallback: knowledgeDateIsFallback } = expenseTtmAnchor;
      costOfGoodsSoldPerShareTtm = computation({ ...coordinateFor('costOfGoodsSoldPerShare'), ...periodTypeGroup('TTM'), value: costOfGoodsSoldPerShareTtmCalc.value, nullReason: costOfGoodsSoldPerShareTtmCalc.nullReason, knowledgeDate, knowledgeDateIsFallback });
      operatingExpensePerShareTtm = computation({ ...coordinateFor('operatingExpensePerShare'), ...periodTypeGroup('TTM'), value: operatingExpensePerShareTtmCalc.value, nullReason: operatingExpensePerShareTtmCalc.nullReason, knowledgeDate, knowledgeDateIsFallback });
      incomeTaxExpensePerShareTtm = computation({ ...coordinateFor('incomeTaxExpensePerShare'), ...periodTypeGroup('TTM'), value: incomeTaxExpensePerShareTtmCalc.value, nullReason: incomeTaxExpensePerShareTtmCalc.nullReason, knowledgeDate, knowledgeDateIsFallback });
    }
  } else if (mainAnchor) {
    const { knowledgeDate, isFallback: knowledgeDateIsFallback } = mainAnchor;
    costOfGoodsSoldPerShareTtm = computation({ ...coordinateFor('costOfGoodsSoldPerShare'), ...periodTypeGroup('TTM'), value: null, nullReason: 'insufficient_history', knowledgeDate, knowledgeDateIsFallback });
    operatingExpensePerShareTtm = computation({ ...coordinateFor('operatingExpensePerShare'), ...periodTypeGroup('TTM'), value: null, nullReason: 'insufficient_history', knowledgeDate, knowledgeDateIsFallback });
    incomeTaxExpensePerShareTtm = computation({ ...coordinateFor('incomeTaxExpensePerShare'), ...periodTypeGroup('TTM'), value: null, nullReason: 'insufficient_history', knowledgeDate, knowledgeDateIsFallback });
  } else {
    costOfGoodsSoldPerShareTtm = { action: 'skipped_no_knowledge_date' };
    operatingExpensePerShareTtm = { action: 'skipped_no_knowledge_date' };
    incomeTaxExpensePerShareTtm = { action: 'skipped_no_knowledge_date' };
  }

  return {
    symbol,
    rocYear: year,
    season,
    slots: {
      grossProfitPerShareQ,
      grossProfitPerShareTtm,
      operatingIncomePerShareQ,
      operatingIncomePerShareTtm,
      costOfGoodsSoldPerShareTtm,
      operatingExpensePerShareTtm,
      incomeTaxExpensePerShareTtm,
    },
  };
};
