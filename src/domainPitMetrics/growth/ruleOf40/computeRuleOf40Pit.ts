import { resolveQuarterOrLatest } from '@/models/latestQuarter';
import { determineNullReason, toPercent } from '@/domainPitMetrics/shared/numericHelpers';
import { isSoftwareOrCloudIndustryCompany } from '@/models/securitiesIndustry';
import { financialDataAdapter, type IncomeStatementPort, type CashFlowStatementPort } from '@/domainPitMetrics/shared/ports/financialDataPorts';
import { getPastNQuarters, rocYearToGregorian, type Season } from '@/shared/rocQuarter';
import type { QuarterlyMetricQuery } from '@/shared/quarterlyMetric';
import { resolveKnowledgeDate } from '../../knowledgeDate';

import { writeMetricValue, periodTypeGroup } from '../../metricValueWriter';
import type { BasisOutcome, StandardBasisPitOutcome } from '../../pitOutcome';
import type { MetricNullReason } from '../../metricBasis';

// Rule of 40（Brad Feld 提出，SaaS/軟體業界廣泛使用的複合指標）= 營收成長率(TTM) + FCF
// 利潤率(TTM)，兩者相加。這裡刻意重新獨立計算，不依賴 revenueGrowthRate（那支是單季年增率，
// Q-only）或 fcfMargin（TTM-only）這兩個 metric_code 已寫入的值——Rule of 40 原始定義兩邊
// 都要用近四季滾動數字，revenueGrowthRate 現有的單季年增率跟這裡要的「TTM vs 去年同期 TTM」
// 是不同的成長率口徑，不能直接借用。只有 TTM 一種 basis。FCF 定義跟 fcfMargin/ownerEarnings
// 一致：營業活動現金流 + 資本支出（來源資料是負值/流出，用加法）。
//
// 2026-09-14 應使用者要求限定產業：這是給軟體/SaaS 商業模式設計的指標，對傳產股套用會失去
// 意義，前置判斷非資訊服務業/數位雲端（見 isSoftwareOrCloudIndustryCompany）一律
// skipped_no_quarter，不寫入任何列——避免對絕大多數不適用的公司做無意義的查詢跟計算。

export type RuleOf40PitOutcome = StandardBasisPitOutcome;

export const computeAndWriteRuleOf40Pit = async (
  query: QuarterlyMetricQuery,
  statements: IncomeStatementPort & CashFlowStatementPort = financialDataAdapter
): Promise<RuleOf40PitOutcome> => {
  const { symbol, dataType, subsidiaryCompanyId } = query;

  if (!(await isSoftwareOrCloudIndustryCompany(symbol))) {
    return { symbol, rocYear: null, season: null, ttm: { action: 'skipped_no_quarter' } };
  }

  const resolvedQuarter = await resolveQuarterOrLatest(query, ['incomeStatement', 'cashFlowStatement']);

  if (!resolvedQuarter) {
    return { symbol, rocYear: null, season: null, ttm: { action: 'skipped_no_quarter' } };
  }

  const { year, season } = resolvedQuarter;
  const rocYear = Number(year);
  const seasonNum = Number(season);
  const fiscalYear = rocYearToGregorian(rocYear);

  // 8 季：前 4 季是「去年同期 TTM」，後 4 季是「本期 TTM」，getPastNQuarters 回傳由舊到新。
  const eightQuarters = getPastNQuarters({ rocYear, season: season as Season }, 8);
  const priorTtmQuarters = eightQuarters.slice(0, 4);
  const currentTtmQuarters = eightQuarters.slice(4, 8);

  const fetchQuarter = (tq: { year: string; season: Season }) =>
    Promise.all([
      statements.getIncomeStatement({ symbol, year: Number(tq.year), quarter: Number(tq.season), dataType, subsidiaryCompanyId }),
      statements.getCashFlowStatement({ symbol, year: Number(tq.year), quarter: Number(tq.season), dataType, subsidiaryCompanyId }),
    ]);

  const [priorRecords, currentRecords] = await Promise.all([
    Promise.all(priorTtmQuarters.map(fetchQuarter)),
    Promise.all(currentTtmQuarters.map(fetchQuarter)),
  ]);

  let priorRevenueTtmSum = 0n;
  let priorComplete = true;
  for (const [incomeRecord] of priorRecords) {
    if (incomeRecord === null || incomeRecord.operatingRevenue === null) {
      priorComplete = false;
    } else {
      priorRevenueTtmSum += incomeRecord.operatingRevenue;
    }
  }

  let currentRevenueTtmSum = 0n;
  let currentFcfTtmSum = 0n;
  let currentComplete = true;
  for (const [incomeRecord, cashFlowRecord] of currentRecords) {
    if (
      incomeRecord === null ||
      cashFlowRecord === null ||
      incomeRecord.operatingRevenue === null ||
      cashFlowRecord.netCashFromOperatingActivities === null ||
      cashFlowRecord.capitalExpenditures === null
    ) {
      currentComplete = false;
    } else {
      currentRevenueTtmSum += incomeRecord.operatingRevenue;
      currentFcfTtmSum += cashFlowRecord.netCashFromOperatingActivities + cashFlowRecord.capitalExpenditures;
    }
  }

  const ttmComplete = priorComplete && currentComplete;

  const revenueGrowthTtmPct = ttmComplete ? toPercent(currentRevenueTtmSum - priorRevenueTtmSum, priorRevenueTtmSum < 0n ? -priorRevenueTtmSum : priorRevenueTtmSum) : null;
  const fcfMarginTtmPct = ttmComplete ? toPercent(currentFcfTtmSum, currentRevenueTtmSum) : null;
  const ttmValue = revenueGrowthTtmPct !== null && fcfMarginTtmPct !== null ? Math.round((revenueGrowthTtmPct + fcfMarginTtmPct) * 100) / 100 : null;
  const ttmNullReason: MetricNullReason | null = ttmValue !== null ? null : ttmComplete ? determineNullReason(currentRevenueTtmSum, priorRevenueTtmSum) : 'insufficient_history';

  const coordinateBase = { symbol, metricCode: 'ruleOf40', fiscalYear, fiscalQuarter: seasonNum, dataType, subsidiaryCompanyId };

  let ttm: BasisOutcome;
  if (ttmComplete) {
    const ttmAnchor = await resolveKnowledgeDate(
      symbol,
      currentTtmQuarters.map((tq, i) => ({ rocYear: Number(tq.year), season: Number(tq.season), reportDate: currentRecords[i]?.[0]?.reportDate ?? null }))
    );
    if (!ttmAnchor) {
      ttm = { action: 'skipped_no_knowledge_date' };
    } else {
      ttm = await writeMetricValue({
        ...coordinateBase,
        ...periodTypeGroup('TTM'),
        value: ttmValue,
        nullReason: ttmNullReason,
        knowledgeDate: ttmAnchor.knowledgeDate,
        knowledgeDateIsFallback: ttmAnchor.isFallback,
      });
    }
  } else {
    const key = { symbol, year: rocYear, quarter: seasonNum, dataType, subsidiaryCompanyId };
    const currentIncome = await statements.getIncomeStatement(key);
    const mainAnchor = await resolveKnowledgeDate(symbol, [{ rocYear, season: seasonNum, reportDate: currentIncome?.reportDate ?? null }]);
    if (!mainAnchor) {
      ttm = { action: 'skipped_no_knowledge_date' };
    } else {
      ttm = await writeMetricValue({
        ...coordinateBase,
        ...periodTypeGroup('TTM'),
        value: null,
        nullReason: 'insufficient_history',
        knowledgeDate: mainAnchor.knowledgeDate,
        knowledgeDateIsFallback: mainAnchor.isFallback,
      });
    }
  }

  return { symbol, rocYear: year, season, ttm };
};
