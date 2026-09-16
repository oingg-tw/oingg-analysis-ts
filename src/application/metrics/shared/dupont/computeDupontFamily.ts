import { resolveQuarterOrLatest } from '@/application/financials/latestQuarter';
import { getPastNQuarters, rocYearToGregorian, type Season } from '@/domain/calendar/rocQuarter';
import type { QuarterlyMetricQuery } from '@/domain/financials/quarterlyMetric';
import { resolveKnowledgeDate } from '../../knowledgeDate';
import { pickNetIncome, pickEquity } from '../../../../domain/metrics/shared/pickers';
import { calculateEbit } from './ebit';
import { calculateNetProfitMargin } from '@/domain/metrics/profitability/netProfitMargin/calculateNetProfitMargin';
import { calculateAssetTurnover } from '@/domain/metrics/efficiency/assetTurnover/calculateAssetTurnover';
import { calculateEquityMultiplier } from '@/domain/metrics/resilience/equityMultiplier/calculateEquityMultiplier';
import { calculateDupontDecomposedRoe } from '@/domain/metrics/profitability/dupontDecomposedRoe/calculateDupontDecomposedRoe';
import { calculateDupontTaxBurden } from '@/domain/metrics/profitability/dupontTaxBurden/calculateDupontTaxBurden';
import { calculateDupontInterestBurden } from '@/domain/metrics/profitability/dupontInterestBurden/calculateDupontInterestBurden';
import { calculateDupontEbitMargin } from '@/domain/metrics/profitability/dupontEbitMargin/calculateDupontEbitMargin';
import { calculateDupontExtendedRoe } from '@/domain/metrics/profitability/dupontExtendedRoe/calculateDupontExtendedRoe';
import { periodTypeGroup } from '@/domain/metrics/coordinate';
import { computation, type ComputationBatch, type ComputationSlot, noQuarterBatch } from '@/domain/metrics/computation';
import type { PitDeps } from '@/application/metrics/deps';

// 這份檔案獨立重新實作 src/domainMetrics/margins.ts（僅 netProfitMargin 這個因子）、
// src/domainMetrics/turnoverRatio.ts（僅 assetTurnover 這個因子）、src/domainMetrics/dupont.ts
// 三支舊架構檔案，刻意不呼叫任何一支既有的 calculateXxx()——一次查詢原始財報資料，本地
// 算出全部四個 metric_code（netProfitMargin/assetTurnover/equityMultiplier/dupontDecomposedRoe），
// 共用同一組 knowledge_date 解析結果，不重複查詢也不互相讀取彼此已寫入的 metric_value 列。
//
// 這是 point-in-time 架構第一次遇到「一個概念天生由多個數字組成」的複合指標——metric_values
// 一列只存一個 value，這裡確立的先例是拆成多個獨立 metric_code（各自單一數字、可獨立查
// 歷史），不是修改 schema 塞 JSON 或多欄位。之後 ROIC/ROCE/Nissim-Penman RNOA 這類多因子
// 指標都複用這個先例。
//
// 2026-09-07 加上五因子 Extended DuPont（把三因子的「淨利率」再拆成稅務負擔×利息負擔×
// EBIT利潤率）——直接在這支函式裡擴充，不開新檔案，因為當季/近四季的損益表+資產負債表
// 已經查好，assetTurnoverQuarterly/equityMultiplierValue（還有 TTM 版本）也已經是本地
// 算好的變數，五因子版本直接重用，不用再查一次資料庫。
//
// 2026-09-08：這個檔案本身只保留「查詢+編排+寫入」（IO 這一層）——每個 metricCode 的實際
// 計算公式已經拆進 calculations/ 底下各自的檔案（一個指標一個檔案），這裡只負責把查回來的
// 原始財報數字傳給對應的 calculateXxx() 純函式、串接輸出、決定 knowledge_date、呼叫
// writeMetricValue。Q 跟 TTM 兩個 basis 共用同一個 calculateXxx() 純函式（公式本身不會因為
// 輸入是單季還是近四季加總而不同），差別只在傳進去的 bigint 是單季原始值還是 TTM 加總值。


export type DupontFamilyDeps = Pick<PitDeps, 'statements' | 'quarters' | 'announcements'>;

export type DupontFamilyComputationBatch = ComputationBatch<'netProfitMarginQ' | 'netProfitMarginTtm' | 'assetTurnoverQ' | 'assetTurnoverTtm' | 'equityMultiplier' | 'dupontDecomposedRoeQ' | 'dupontDecomposedRoeTtm' | 'dupontTaxBurdenQ' | 'dupontTaxBurdenTtm' | 'dupontInterestBurdenQ' | 'dupontInterestBurdenTtm' | 'dupontEbitMarginQ' | 'dupontEbitMarginTtm' | 'dupontExtendedRoeQ' | 'dupontExtendedRoeTtm'>;

export const computeDupontFamily = async (
  query: QuarterlyMetricQuery,
  deps: DupontFamilyDeps
): Promise<DupontFamilyComputationBatch> => {
  const { symbol, dataType, subsidiaryCompanyId } = query;

  const skippedNoQuarter: DupontFamilyComputationBatch = noQuarterBatch(symbol, ['netProfitMarginQ', 'netProfitMarginTtm', 'assetTurnoverQ', 'assetTurnoverTtm', 'equityMultiplier', 'dupontDecomposedRoeQ', 'dupontDecomposedRoeTtm', 'dupontTaxBurdenQ', 'dupontTaxBurdenTtm', 'dupontInterestBurdenQ', 'dupontInterestBurdenTtm', 'dupontEbitMarginQ', 'dupontEbitMarginTtm', 'dupontExtendedRoeQ', 'dupontExtendedRoeTtm']);

  const resolvedQuarter = await resolveQuarterOrLatest(query, ['balanceSheet', 'incomeStatement'], deps.quarters);

  if (!resolvedQuarter) return skippedNoQuarter;

  const { year, season } = resolvedQuarter;
  const rocYear = Number(year);
  const seasonNum = Number(season);
  const fiscalYear = rocYearToGregorian(rocYear);

  const key = { symbol, year: rocYear, quarter: seasonNum, dataType, subsidiaryCompanyId };
  const [incomeStatement, balanceSheet] = await Promise.all([deps.statements.getIncomeStatement(key), deps.statements.getBalanceSheet(key)]);

  const netIncome = pickNetIncome(incomeStatement);
  const equity = pickEquity(balanceSheet);
  const operatingRevenue = incomeStatement?.operatingRevenue ?? null;
  const totalAssets = balanceSheet?.totalAssets ?? null;

  const netProfitMarginQuarterly = calculateNetProfitMargin(netIncome.value, operatingRevenue);
  const assetTurnoverQuarterly = calculateAssetTurnover(operatingRevenue, totalAssets);
  const equityMultiplierResult = calculateEquityMultiplier(totalAssets, equity.value);
  const decomposedRoeQuarterly = calculateDupontDecomposedRoe(netProfitMarginQuarterly.value, assetTurnoverQuarterly.value, equityMultiplierResult.value);

  // 五因子 Extended DuPont：把上面的 netProfitMargin 再拆成稅務負擔×利息負擔×EBIT利潤率。
  const profitBeforeTax = incomeStatement?.profitBeforeTax ?? null;
  const financeCosts = incomeStatement?.financeCosts ?? null;
  const ebit = calculateEbit(profitBeforeTax, financeCosts);

  const dupontTaxBurdenQuarterly = calculateDupontTaxBurden(netIncome.value, profitBeforeTax);
  const dupontInterestBurdenQuarterly = calculateDupontInterestBurden(profitBeforeTax, ebit);
  const dupontEbitMarginQuarterly = calculateDupontEbitMargin(ebit, operatingRevenue);
  const extendedRoeQuarterly = calculateDupontExtendedRoe(
    dupontTaxBurdenQuarterly.value,
    dupontInterestBurdenQuarterly.value,
    dupontEbitMarginQuarterly.value,
    assetTurnoverQuarterly.value,
    equityMultiplierResult.value,
  );

  const reportDate = balanceSheet?.reportDate ?? incomeStatement?.reportDate ?? null;
  const mainAnchor = await resolveKnowledgeDate(symbol, [{ rocYear, season: seasonNum, reportDate }], deps.announcements);

  const coordinateFor = (metricCode: string) => ({ symbol, metricCode, fiscalYear, fiscalQuarter: seasonNum, dataType, subsidiaryCompanyId });

  let netProfitMarginQ: ComputationSlot;
  let assetTurnoverQ: ComputationSlot;
  let equityMultiplierOutcome: ComputationSlot;
  let dupontDecomposedRoeQ: ComputationSlot;
  let dupontTaxBurdenQ: ComputationSlot;
  let dupontInterestBurdenQ: ComputationSlot;
  let dupontEbitMarginQ: ComputationSlot;
  let dupontExtendedRoeQ: ComputationSlot;

  if (!mainAnchor) {
    netProfitMarginQ = { action: 'skipped_no_knowledge_date' };
    assetTurnoverQ = { action: 'skipped_no_knowledge_date' };
    equityMultiplierOutcome = { action: 'skipped_no_knowledge_date' };
    dupontDecomposedRoeQ = { action: 'skipped_no_knowledge_date' };
    dupontTaxBurdenQ = { action: 'skipped_no_knowledge_date' };
    dupontInterestBurdenQ = { action: 'skipped_no_knowledge_date' };
    dupontEbitMarginQ = { action: 'skipped_no_knowledge_date' };
    dupontExtendedRoeQ = { action: 'skipped_no_knowledge_date' };
  } else {
    const { knowledgeDate, isFallback: knowledgeDateIsFallback } = mainAnchor;
    netProfitMarginQ = computation({
      ...coordinateFor('netProfitMargin'),
      ...periodTypeGroup('Q'),
      value: netProfitMarginQuarterly.value,
      nullReason: netProfitMarginQuarterly.nullReason,
      knowledgeDate,
      knowledgeDateIsFallback,
    });
    assetTurnoverQ = computation({
      ...coordinateFor('assetTurnover'),
      ...periodTypeGroup('Q'),
      value: assetTurnoverQuarterly.value,
      nullReason: assetTurnoverQuarterly.nullReason,
      knowledgeDate,
      knowledgeDateIsFallback,
    });
    equityMultiplierOutcome = computation({
      ...coordinateFor('equityMultiplier'),
      ...periodTypeGroup('Q'),
      value: equityMultiplierResult.value,
      nullReason: equityMultiplierResult.nullReason,
      knowledgeDate,
      knowledgeDateIsFallback,
    });
    dupontDecomposedRoeQ = computation({
      ...coordinateFor('dupontDecomposedRoe'),
      ...periodTypeGroup('Q'),
      value: decomposedRoeQuarterly.value,
      nullReason: decomposedRoeQuarterly.nullReason,
      knowledgeDate,
      knowledgeDateIsFallback,
    });
    dupontTaxBurdenQ = computation({
      ...coordinateFor('dupontTaxBurden'),
      ...periodTypeGroup('Q'),
      value: dupontTaxBurdenQuarterly.value,
      nullReason: dupontTaxBurdenQuarterly.nullReason,
      knowledgeDate,
      knowledgeDateIsFallback,
    });
    dupontInterestBurdenQ = computation({
      ...coordinateFor('dupontInterestBurden'),
      ...periodTypeGroup('Q'),
      value: dupontInterestBurdenQuarterly.value,
      nullReason: dupontInterestBurdenQuarterly.nullReason,
      knowledgeDate,
      knowledgeDateIsFallback,
    });
    dupontEbitMarginQ = computation({
      ...coordinateFor('dupontEbitMargin'),
      ...periodTypeGroup('Q'),
      value: dupontEbitMarginQuarterly.value,
      nullReason: dupontEbitMarginQuarterly.nullReason,
      knowledgeDate,
      knowledgeDateIsFallback,
    });
    dupontExtendedRoeQ = computation({
      ...coordinateFor('dupontExtendedRoe'),
      ...periodTypeGroup('Q'),
      value: extendedRoeQuarterly.value,
      nullReason: extendedRoeQuarterly.nullReason,
      knowledgeDate,
      knowledgeDateIsFallback,
    });
  }

  // TTM：近四季（含本季）營收/淨利加總；assetTurnover 分母沿用「本季期末總資產」（不是加總），
  // 跟 turnoverRatio.ts 的既有簡化一致。一季只要營收或淨利任一為 null 就視為該季不齊，
  // netProfitMargin/assetTurnover 的 TTM 共用同一組「資料齊不齊」判斷（比照 margins.ts）。
  const ttmQuarters = getPastNQuarters({ rocYear, season: season as Season }, 4);
  const ttmRecords = await Promise.all(
    ttmQuarters.map((tq) => deps.statements.getIncomeStatement({ symbol, year: Number(tq.year), quarter: Number(tq.season), dataType, subsidiaryCompanyId }))
  );

  let revenueTtmSum = 0n;
  let netIncomeTtmSum = 0n;
  let ttmComplete = true;
  // 五因子的 TTM 需要額外的稅前淨利/財務費用，比原本三因子多一層完整度要求——用獨立的
  // extendedTtmComplete 旗標，不動既有 ttmComplete（避免五因子的新輸入缺漏反過來讓既有
  // netProfitMargin/assetTurnover/dupontDecomposedRoe 的 TTM 從「算得出來」退步成
  // insufficient_history）。extendedTtmComplete 蘊含 ttmComplete（後者不齊時前者一定
  // 也不齊），但反過來不成立。
  let preTaxTtmSum = 0n;
  let ebitTtmSum = 0n;
  let extendedTtmComplete = true;
  for (const record of ttmRecords) {
    const picked = pickNetIncome(record);
    if (record === null || record.operatingRevenue === null || picked.value === null) {
      ttmComplete = false;
      extendedTtmComplete = false;
    } else {
      revenueTtmSum += record.operatingRevenue;
      netIncomeTtmSum += picked.value;
      if (record.profitBeforeTax === null || record.financeCosts === null) {
        extendedTtmComplete = false;
      } else {
        preTaxTtmSum += record.profitBeforeTax;
        ebitTtmSum += record.profitBeforeTax + record.financeCosts;
      }
    }
  }

  const netProfitMarginTtmCalc = ttmComplete ? calculateNetProfitMargin(netIncomeTtmSum, revenueTtmSum) : { value: null, nullReason: 'insufficient_history' as const };
  const assetTurnoverTtmCalc = ttmComplete && totalAssets !== null ? calculateAssetTurnover(revenueTtmSum, totalAssets) : { value: null, nullReason: 'insufficient_history' as const };

  const decomposedRoeTtmCalc = calculateDupontDecomposedRoe(netProfitMarginTtmCalc.value, assetTurnoverTtmCalc.value, equityMultiplierResult.value);
  const decomposedRoeTtmNullReason = decomposedRoeTtmCalc.value !== null ? null : ttmComplete ? 'missing_input' : ('insufficient_history' as const);

  const dupontTaxBurdenTtmCalc = extendedTtmComplete ? calculateDupontTaxBurden(netIncomeTtmSum, preTaxTtmSum) : { value: null, nullReason: 'insufficient_history' as const };
  const ebitTtm = extendedTtmComplete ? ebitTtmSum : null;
  const dupontInterestBurdenTtmCalc = extendedTtmComplete ? calculateDupontInterestBurden(preTaxTtmSum, ebitTtm) : { value: null, nullReason: 'insufficient_history' as const };
  const dupontEbitMarginTtmCalc = extendedTtmComplete ? calculateDupontEbitMargin(ebitTtm, revenueTtmSum) : { value: null, nullReason: 'insufficient_history' as const };

  const extendedRoeTtmCalc = calculateDupontExtendedRoe(
    dupontTaxBurdenTtmCalc.value,
    dupontInterestBurdenTtmCalc.value,
    dupontEbitMarginTtmCalc.value,
    assetTurnoverTtmCalc.value,
    equityMultiplierResult.value,
  );
  const extendedRoeTtmNullReason = extendedRoeTtmCalc.value !== null ? null : extendedTtmComplete ? 'missing_input' : ('insufficient_history' as const);

  let netProfitMarginTtm: ComputationSlot;
  let assetTurnoverTtm: ComputationSlot;
  let dupontDecomposedRoeTtm: ComputationSlot;
  let dupontTaxBurdenTtm: ComputationSlot;
  let dupontInterestBurdenTtm: ComputationSlot;
  let dupontEbitMarginTtm: ComputationSlot;
  let dupontExtendedRoeTtm: ComputationSlot;

  if (ttmComplete) {
    const ttmAnchor = await resolveKnowledgeDate(
      symbol,
      ttmQuarters.map((tq, i) => ({ rocYear: Number(tq.year), season: Number(tq.season), reportDate: ttmRecords[i]?.reportDate ?? null })), deps.announcements
    );
    if (!ttmAnchor) {
      netProfitMarginTtm = { action: 'skipped_no_knowledge_date' };
      assetTurnoverTtm = { action: 'skipped_no_knowledge_date' };
      dupontDecomposedRoeTtm = { action: 'skipped_no_knowledge_date' };
      dupontTaxBurdenTtm = { action: 'skipped_no_knowledge_date' };
      dupontInterestBurdenTtm = { action: 'skipped_no_knowledge_date' };
      dupontEbitMarginTtm = { action: 'skipped_no_knowledge_date' };
      dupontExtendedRoeTtm = { action: 'skipped_no_knowledge_date' };
    } else {
      const { knowledgeDate, isFallback: knowledgeDateIsFallback } = ttmAnchor;
      netProfitMarginTtm = computation({
        ...coordinateFor('netProfitMargin'),
        ...periodTypeGroup('TTM'),
        value: netProfitMarginTtmCalc.value,
        nullReason: netProfitMarginTtmCalc.nullReason,
        knowledgeDate,
        knowledgeDateIsFallback,
      });
      assetTurnoverTtm = computation({
        ...coordinateFor('assetTurnover'),
        ...periodTypeGroup('TTM'),
        value: assetTurnoverTtmCalc.value,
        nullReason: assetTurnoverTtmCalc.nullReason,
        knowledgeDate,
        knowledgeDateIsFallback,
      });
      dupontDecomposedRoeTtm = computation({
        ...coordinateFor('dupontDecomposedRoe'),
        ...periodTypeGroup('TTM'),
        value: decomposedRoeTtmCalc.value,
        nullReason: decomposedRoeTtmNullReason,
        knowledgeDate,
        knowledgeDateIsFallback,
      });
      // ttmComplete=true 只保證既有三因子的 TTM 齊全，五因子額外需要的稅前淨利/財務費用
      // 可能還是缺——用同一個 ttmAnchor 的 knowledge_date（季度組合相同，只是輸入完整度
      // 不同），extendedTtmComplete=false 時正確寫 null+insufficient_history，不是
      // skipped_no_knowledge_date（knowledge_date 本身是解得出來的，只是這批新因子的
      // 輸入不齊）。
      dupontTaxBurdenTtm = computation({
        ...coordinateFor('dupontTaxBurden'),
        ...periodTypeGroup('TTM'),
        value: dupontTaxBurdenTtmCalc.value,
        nullReason: dupontTaxBurdenTtmCalc.nullReason,
        knowledgeDate,
        knowledgeDateIsFallback,
      });
      dupontInterestBurdenTtm = computation({
        ...coordinateFor('dupontInterestBurden'),
        ...periodTypeGroup('TTM'),
        value: dupontInterestBurdenTtmCalc.value,
        nullReason: dupontInterestBurdenTtmCalc.nullReason,
        knowledgeDate,
        knowledgeDateIsFallback,
      });
      dupontEbitMarginTtm = computation({
        ...coordinateFor('dupontEbitMargin'),
        ...periodTypeGroup('TTM'),
        value: dupontEbitMarginTtmCalc.value,
        nullReason: dupontEbitMarginTtmCalc.nullReason,
        knowledgeDate,
        knowledgeDateIsFallback,
      });
      dupontExtendedRoeTtm = computation({
        ...coordinateFor('dupontExtendedRoe'),
        ...periodTypeGroup('TTM'),
        value: extendedRoeTtmCalc.value,
        nullReason: extendedRoeTtmNullReason,
        knowledgeDate,
        knowledgeDateIsFallback,
      });
    }
  } else if (mainAnchor) {
    const { knowledgeDate, isFallback: knowledgeDateIsFallback } = mainAnchor;
    netProfitMarginTtm = computation({
      ...coordinateFor('netProfitMargin'),
      ...periodTypeGroup('TTM'),
      value: null,
      nullReason: 'insufficient_history',
      knowledgeDate,
      knowledgeDateIsFallback,
    });
    assetTurnoverTtm = computation({
      ...coordinateFor('assetTurnover'),
      ...periodTypeGroup('TTM'),
      value: null,
      nullReason: 'insufficient_history',
      knowledgeDate,
      knowledgeDateIsFallback,
    });
    dupontDecomposedRoeTtm = computation({
      ...coordinateFor('dupontDecomposedRoe'),
      ...periodTypeGroup('TTM'),
      value: null,
      nullReason: 'insufficient_history',
      knowledgeDate,
      knowledgeDateIsFallback,
    });
    dupontTaxBurdenTtm = computation({
      ...coordinateFor('dupontTaxBurden'),
      ...periodTypeGroup('TTM'),
      value: null,
      nullReason: 'insufficient_history',
      knowledgeDate,
      knowledgeDateIsFallback,
    });
    dupontInterestBurdenTtm = computation({
      ...coordinateFor('dupontInterestBurden'),
      ...periodTypeGroup('TTM'),
      value: null,
      nullReason: 'insufficient_history',
      knowledgeDate,
      knowledgeDateIsFallback,
    });
    dupontEbitMarginTtm = computation({
      ...coordinateFor('dupontEbitMargin'),
      ...periodTypeGroup('TTM'),
      value: null,
      nullReason: 'insufficient_history',
      knowledgeDate,
      knowledgeDateIsFallback,
    });
    dupontExtendedRoeTtm = computation({
      ...coordinateFor('dupontExtendedRoe'),
      ...periodTypeGroup('TTM'),
      value: null,
      nullReason: 'insufficient_history',
      knowledgeDate,
      knowledgeDateIsFallback,
    });
  } else {
    netProfitMarginTtm = { action: 'skipped_no_knowledge_date' };
    assetTurnoverTtm = { action: 'skipped_no_knowledge_date' };
    dupontDecomposedRoeTtm = { action: 'skipped_no_knowledge_date' };
    dupontTaxBurdenTtm = { action: 'skipped_no_knowledge_date' };
    dupontInterestBurdenTtm = { action: 'skipped_no_knowledge_date' };
    dupontEbitMarginTtm = { action: 'skipped_no_knowledge_date' };
    dupontExtendedRoeTtm = { action: 'skipped_no_knowledge_date' };
  }

  return { symbol, rocYear: year, season, slots: { netProfitMarginQ, netProfitMarginTtm, assetTurnoverQ, assetTurnoverTtm, equityMultiplier: equityMultiplierOutcome, dupontDecomposedRoeQ, dupontDecomposedRoeTtm, dupontTaxBurdenQ, dupontTaxBurdenTtm, dupontInterestBurdenQ, dupontInterestBurdenTtm, dupontEbitMarginQ, dupontEbitMarginTtm, dupontExtendedRoeQ, dupontExtendedRoeTtm } };
};
