import { getLatestAvailableQuarter } from '@/shared/sourceData/latestQuarter';
import { getLatestQuarterWithInsuranceIncomeStatement } from '@/shared/sourceData/insuranceIncomeStatementXbrlFirst';
import { financialDataAdapter, type IncomeStatementPort, type InsuranceIncomeStatementPort } from '@/domainPitMetrics/shared/ports/financialDataPorts';
import { getPastNQuarters, rocYearToGregorian, type Season } from '@/shared/rocQuarter';
import type { QuarterlyMetricQuery } from '@/shared/quarterlyMetric';
import { resolveKnowledgeDate } from '../../knowledgeDate';

import { writeMetricValue, type MetricValueWriteOutcome, periodTypeGroup } from '../../metricValueWriter';
import { calculateGrossMargin } from '@/domainPitMetrics/profitability/grossMargin/calculateGrossMargin';
import { calculateOperatingMargin } from '@/domainPitMetrics/profitability/operatingMargin/calculateOperatingMargin';

// 這份檔案獨立重新實作 src/domainMetrics/margins.ts 裡「還沒遷移」的兩個率（毛利率/
// 營業利益率）——netProfitMargin 已經由 src/domainPitMetrics/shared/dupont/computeDupontFamilyPit.ts
// 寫入，這裡不重複寫。一次查詢拆兩個 metric_code，跟 Dupont 家族同一種模式。
//
// 刻意的行為差異：舊架構 margins.ts 的 TTM 完整度判斷是「營收/毛利/營業利益/淨利」四個
// 欄位共用一個旗標（因為舊架構一次算三個率）。這裡只算毛利率/營業利益率兩個率，TTM
// 完整度判斷只看「營收/毛利/營業利益」三個欄位，不看淨利——不應該因為淨利缺漏就連累
// 毛利率算不出來，這是比舊架構更精確的判斷，不是疏漏。
//
// 2026-09-08 新增保險業（IFRS17）替代科目 fallback——保險業財報結構沒有「銷貨成本/
// 毛利」概念，一般產業科目在保險業 XBRL 資料裡完全不存在（不是資料缺漏）。查證+對照
// conductor-ts 研究筆記後定案的三層對照見 insuranceIncomeStatementXbrlFirst.ts 檔頭：
// revenue -> insurance_revenue、grossProfit -> insurance_service_result、
// operatingIncome -> net_operating_income_loss。金控業刻意不做同樣的事（margin/
// turnover 概念在金控業結構性不成立，需要全新指標概念，不是替代科目能解決的問題，
// 同樣見那份研究筆記的說明），不要看到這裡的模式就依樣畫葫蘆幫金控業加。
export interface MarginInputs {
  reportDate: Date;
  revenue: bigint | null;
  grossProfitLike: bigint | null;
  operatingIncomeLike: bigint | null;
  isInsuranceFallback: boolean;
}

// 2026-09-13 稽核鏈擴大到 grossMargin/operatingMargin 需要重用這支「一般表 or 保險替代表」
// 的查詢邏輯（見下方保險業 fallback 說明），改成 export——純查詢函式，沒有副作用，跟
// getGreenblattRocInputs 抽出來給 provenance 重用是同一個模式。多回傳一個
// isInsuranceFallback 旗標，讓 provenance 知道這筆該標哪個 statementType/fieldKey。
export const getMarginInputs = async (
  key: {
    symbol: string;
    year: number;
    quarter: number;
    dataType: string;
    subsidiaryCompanyId: string;
  },
  statements: IncomeStatementPort & InsuranceIncomeStatementPort = financialDataAdapter
): Promise<MarginInputs | null> => {
  const incomeStatement = await statements.getIncomeStatement(key);
  if (incomeStatement?.operatingRevenue != null) {
    return { reportDate: incomeStatement.reportDate, revenue: incomeStatement.operatingRevenue, grossProfitLike: incomeStatement.grossProfit, operatingIncomeLike: incomeStatement.operatingIncome, isInsuranceFallback: false };
  }

  const insurance = await statements.getInsuranceIncomeStatement(key);
  if (insurance) {
    return { reportDate: insurance.reportDate, revenue: insurance.insuranceRevenue, grossProfitLike: insurance.insuranceServiceResult, operatingIncomeLike: insurance.netOperatingIncomeLoss, isInsuranceFallback: true };
  }

  // 一般查得到列但 operatingRevenue 是 null（例如保險業在一般表裡有 profit_loss 等
  // 欄位、只是沒有 revenue），且保險替代也查無資料——回傳一般查詢結果的 reportDate（如果
  // 有）讓 knowledgeDate 解析至少能跑，三個金額欄位維持 null 走既有的 missing_input 邏輯。
  if (incomeStatement) {
    return { reportDate: incomeStatement.reportDate, revenue: null, grossProfitLike: null, operatingIncomeLike: null, isInsuranceFallback: false };
  }
  return null;
};

// 2026-09-08：這個檔案本身只保留「查詢+編排+寫入」（IO 這一層）——grossMargin/
// operatingMargin 兩個 metricCode 的實際計算公式已經拆進 calculations/ 底下各自的檔案，
// 這裡只負責把查回來的原始財報數字傳給對應的 calculateXxx() 純函式、串接輸出、決定
// knowledge_date、呼叫 writeMetricValue。

type BasisOutcome = MetricValueWriteOutcome | { action: 'skipped_no_knowledge_date' } | { action: 'skipped_no_quarter' };

export interface MarginsFamilyPitOutcome {
  symbol: string;
  rocYear: string | null;
  season: string | null;
  grossMarginQ: BasisOutcome;
  grossMarginTtm: BasisOutcome;
  operatingMarginQ: BasisOutcome;
  operatingMarginTtm: BasisOutcome;
}

export const computeAndWriteMarginsFamilyPit = async (
  query: QuarterlyMetricQuery,
  statements: IncomeStatementPort & InsuranceIncomeStatementPort = financialDataAdapter
): Promise<MarginsFamilyPitOutcome> => {
  const { symbol, dataType, subsidiaryCompanyId } = query;

  const skippedNoQuarter: MarginsFamilyPitOutcome = {
    symbol,
    rocYear: null,
    season: null,
    grossMarginQ: { action: 'skipped_no_quarter' },
    grossMarginTtm: { action: 'skipped_no_quarter' },
    operatingMarginQ: { action: 'skipped_no_quarter' },
    operatingMarginTtm: { action: 'skipped_no_quarter' },
  };

  // 一般 incomeStatement 查無資料（例如 2851 中再保在舊架構 legacy 表完全沒有列）時，
  // 改用保險替代來源解析「最新一季」——兩個資料源獨立各自解析一次最新季度，取交集下界
  // 的邏輯跟 getLatestAvailableQuarter 內部一致，但這裡是「一般 OR 保險替代」不是
  // 「一般 AND 現金流量表」，所以不能直接塞進 getLatestAvailableQuarter 的 sources
  // 參數，用獨立的 fallback 呼叫。
  const resolvedQuarter =
    query.year !== undefined && query.season !== undefined
      ? { year: query.year, season: query.season }
      : ((await getLatestAvailableQuarter(symbol, dataType, subsidiaryCompanyId, ['incomeStatement'])) ??
        (await getLatestQuarterWithInsuranceIncomeStatement(symbol, dataType, subsidiaryCompanyId).then((q) => (q ? { year: String(q.year), season: String(q.quarter) as Season } : null))));

  if (!resolvedQuarter) return skippedNoQuarter;

  const { year, season } = resolvedQuarter;
  const rocYear = Number(year);
  const seasonNum = Number(season);
  const fiscalYear = rocYearToGregorian(rocYear);

  const key = { symbol, year: rocYear, quarter: seasonNum, dataType, subsidiaryCompanyId };
  const marginInputs = await getMarginInputs(key, statements);
  const operatingRevenue = marginInputs?.revenue ?? null;
  const grossProfit = marginInputs?.grossProfitLike ?? null;
  const operatingIncome = marginInputs?.operatingIncomeLike ?? null;
  const reportDate = marginInputs?.reportDate ?? null;

  const grossMarginQuarterly = calculateGrossMargin(grossProfit, operatingRevenue);
  const operatingMarginQuarterly = calculateOperatingMargin(operatingIncome, operatingRevenue);

  const mainAnchor = await resolveKnowledgeDate(symbol, [{ rocYear, season: seasonNum, reportDate }]);
  const coordinateFor = (metricCode: string) => ({ symbol, metricCode, fiscalYear, fiscalQuarter: seasonNum, dataType, subsidiaryCompanyId });

  let grossMarginQ: BasisOutcome;
  let operatingMarginQ: BasisOutcome;

  if (!mainAnchor) {
    grossMarginQ = { action: 'skipped_no_knowledge_date' };
    operatingMarginQ = { action: 'skipped_no_knowledge_date' };
  } else {
    const { knowledgeDate, isFallback: knowledgeDateIsFallback } = mainAnchor;
    grossMarginQ = await writeMetricValue({ ...coordinateFor('grossMargin'), ...periodTypeGroup('Q'), value: grossMarginQuarterly.value, nullReason: grossMarginQuarterly.nullReason, knowledgeDate, knowledgeDateIsFallback });
    operatingMarginQ = await writeMetricValue({
      ...coordinateFor('operatingMargin'),
      ...periodTypeGroup('Q'),
      value: operatingMarginQuarterly.value,
      nullReason: operatingMarginQuarterly.nullReason,
      knowledgeDate,
      knowledgeDateIsFallback,
    });
  }

  // TTM：近四季（含本季）營收/毛利/營業利益各自加總。一季只要這三個欄位任一為 null 就視為
  // 該季不齊——刻意不看淨利（見檔頭說明的行為差異）。每一季各自呼叫 getMarginInputs（一般
  // 查無資料時自動退回保險替代），不是整批只判斷一次資料源——理論上一家公司不會中途切換
  // 產業別，但這樣寫不用假設「本季用的來源，前三季一定也用同一個」。
  const ttmQuarters = getPastNQuarters({ rocYear, season: season as Season }, 4);
  const ttmRecords = await Promise.all(
    ttmQuarters.map((tq) => getMarginInputs({ symbol, year: Number(tq.year), quarter: Number(tq.season), dataType, subsidiaryCompanyId }, statements))
  );

  let revenueTtmSum = 0n;
  let grossProfitTtmSum = 0n;
  let operatingIncomeTtmSum = 0n;
  let ttmComplete = true;
  for (const record of ttmRecords) {
    if (record === null || record.revenue === null || record.grossProfitLike === null || record.operatingIncomeLike === null) {
      ttmComplete = false;
    } else {
      revenueTtmSum += record.revenue;
      grossProfitTtmSum += record.grossProfitLike;
      operatingIncomeTtmSum += record.operatingIncomeLike;
    }
  }

  const grossMarginTtmCalc = ttmComplete ? calculateGrossMargin(grossProfitTtmSum, revenueTtmSum) : { value: null, nullReason: 'insufficient_history' as const };
  const operatingMarginTtmCalc = ttmComplete ? calculateOperatingMargin(operatingIncomeTtmSum, revenueTtmSum) : { value: null, nullReason: 'insufficient_history' as const };

  let grossMarginTtm: BasisOutcome;
  let operatingMarginTtm: BasisOutcome;

  if (ttmComplete) {
    const ttmAnchor = await resolveKnowledgeDate(
      symbol,
      ttmQuarters.map((tq, i) => ({ rocYear: Number(tq.year), season: Number(tq.season), reportDate: ttmRecords[i]?.reportDate ?? null }))
    );
    if (!ttmAnchor) {
      grossMarginTtm = { action: 'skipped_no_knowledge_date' };
      operatingMarginTtm = { action: 'skipped_no_knowledge_date' };
    } else {
      const { knowledgeDate, isFallback: knowledgeDateIsFallback } = ttmAnchor;
      grossMarginTtm = await writeMetricValue({
        ...coordinateFor('grossMargin'),
        ...periodTypeGroup('TTM'),
        value: grossMarginTtmCalc.value,
        nullReason: grossMarginTtmCalc.nullReason,
        knowledgeDate,
        knowledgeDateIsFallback,
      });
      operatingMarginTtm = await writeMetricValue({
        ...coordinateFor('operatingMargin'),
        ...periodTypeGroup('TTM'),
        value: operatingMarginTtmCalc.value,
        nullReason: operatingMarginTtmCalc.nullReason,
        knowledgeDate,
        knowledgeDateIsFallback,
      });
    }
  } else if (mainAnchor) {
    const { knowledgeDate, isFallback: knowledgeDateIsFallback } = mainAnchor;
    grossMarginTtm = await writeMetricValue({ ...coordinateFor('grossMargin'), ...periodTypeGroup('TTM'), value: null, nullReason: 'insufficient_history', knowledgeDate, knowledgeDateIsFallback });
    operatingMarginTtm = await writeMetricValue({ ...coordinateFor('operatingMargin'), ...periodTypeGroup('TTM'), value: null, nullReason: 'insufficient_history', knowledgeDate, knowledgeDateIsFallback });
  } else {
    grossMarginTtm = { action: 'skipped_no_knowledge_date' };
    operatingMarginTtm = { action: 'skipped_no_knowledge_date' };
  }

  return { symbol, rocYear: year, season, grossMarginQ, grossMarginTtm, operatingMarginQ, operatingMarginTtm };
};
