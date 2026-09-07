import { getLatestAvailableQuarter } from '@/shared/sourceData/latestQuarter';
import { getBalanceSheetXbrlFirst as getQuarterlyBalanceSheet } from '@/shared/sourceData/balanceSheetXbrlFirst';
import { getIncomeStatementXbrlFirst as getQuarterlyIncomeStatement } from '@/shared/sourceData/incomeStatementXbrlFirst';
import { getPastNQuarters, rocYearToGregorian, type Season } from '@/shared/rocQuarter';
import type { QuarterlyMetricQuery } from '@/shared/quarterlyMetric';
import { resolveKnowledgeDate } from '../../knowledgeDate';

import { writeMetricValue, type MetricValueWriteOutcome } from '../../metricValueWriter';
import type { MetricNullReason } from '../../metricBasis';

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
// 算好的變數，五因子版本直接重用，不用再查一次資料庫。EBIT = 稅前淨利+財務費用，跟
// roic/roce/interestCoverage/netDebtToEbitda/evEbitda 已經在用的定義一致——注意這個
// EBIT**不等於**既有的 operatingMargin 用的 operatingIncome（後者嚴格排除所有非營業
// 損益，前者只加回財務費用，非營業損益還留在裡面），兩個「利潤率」數字不一樣，這批新
// metric_code 全部加 dupont 前綴避免混淆。新的 4 個 metric_code：dupontTaxBurden（淨利/
// 稅前淨利）、dupontInterestBurden（稅前淨利/EBIT）、dupontEbitMargin（EBIT/營收）、
// dupontExtendedRoe（五因子相乘的組裝結果，理論上等於既有的 dupontDecomposedRoe，
// 已用 2330 115Q2 真實資料驗證過兩者一致）。

const pickNetIncome = (
  record: { netIncomeAttributableToParent: bigint | null; netIncome: bigint | null } | null
): { value: bigint | null } => {
  if (!record) return { value: null };
  if (record.netIncomeAttributableToParent !== null) return { value: record.netIncomeAttributableToParent };
  if (record.netIncome !== null) return { value: record.netIncome };
  return { value: null };
};

const pickEquity = (record: { equityAttributableToParent: bigint | null; totalEquity: bigint | null } | null): { value: bigint | null } => {
  if (!record) return { value: null };
  if (record.equityAttributableToParent !== null) return { value: record.equityAttributableToParent };
  if (record.totalEquity !== null) return { value: record.totalEquity };
  return { value: null };
};

const toPct = (numerator: bigint, denominator: bigint): number | null => {
  if (denominator === 0n) return null;
  return Math.round((Number(numerator) / Number(denominator)) * 100 * 100) / 100;
};

// 比率型（「次」）的四捨五入到小數 2 位，跟 turnoverRatio.ts 的 toTurnover 一致。
const toRatio = (numerator: bigint, denominator: bigint): number | null => {
  if (denominator === 0n) return null;
  return Math.round((Number(numerator) / Number(denominator)) * 100) / 100;
};

const round2 = (x: number): number => Math.round(x * 100) / 100;

// 分子/分母任一為 null 視為缺輸入；兩者皆非 null 但分母為 0 才是「分母為零」——負值不擋，
// 沿用既有「扭曲但仍是真實數字」的行為。
const determineNullReason = (numerator: bigint | null, denominator: bigint | null): MetricNullReason => {
  if (numerator === null || denominator === null) return 'missing_input';
  return 'zero_or_negative_denominator';
};

type BasisOutcome = MetricValueWriteOutcome | { action: 'skipped_no_knowledge_date' } | { action: 'skipped_no_quarter' };

export interface DupontFamilyPitOutcome {
  symbol: string;
  rocYear: string | null;
  season: string | null;
  netProfitMarginQ: BasisOutcome;
  netProfitMarginTtm: BasisOutcome;
  assetTurnoverQ: BasisOutcome;
  assetTurnoverQAnn: BasisOutcome;
  assetTurnoverTtm: BasisOutcome;
  equityMultiplier: BasisOutcome;
  dupontDecomposedRoeQ: BasisOutcome;
  dupontDecomposedRoeTtm: BasisOutcome;
  dupontTaxBurdenQ: BasisOutcome;
  dupontTaxBurdenTtm: BasisOutcome;
  dupontInterestBurdenQ: BasisOutcome;
  dupontInterestBurdenTtm: BasisOutcome;
  dupontEbitMarginQ: BasisOutcome;
  dupontEbitMarginTtm: BasisOutcome;
  dupontExtendedRoeQ: BasisOutcome;
  dupontExtendedRoeTtm: BasisOutcome;
}

export const computeAndWriteDupontFamilyPit = async (query: QuarterlyMetricQuery): Promise<DupontFamilyPitOutcome> => {
  const { symbol, dataType, subsidiaryCompanyId } = query;

  const skippedNoQuarter: DupontFamilyPitOutcome = {
    symbol,
    rocYear: null,
    season: null,
    netProfitMarginQ: { action: 'skipped_no_quarter' },
    netProfitMarginTtm: { action: 'skipped_no_quarter' },
    assetTurnoverQ: { action: 'skipped_no_quarter' },
    assetTurnoverQAnn: { action: 'skipped_no_quarter' },
    assetTurnoverTtm: { action: 'skipped_no_quarter' },
    equityMultiplier: { action: 'skipped_no_quarter' },
    dupontDecomposedRoeQ: { action: 'skipped_no_quarter' },
    dupontDecomposedRoeTtm: { action: 'skipped_no_quarter' },
    dupontTaxBurdenQ: { action: 'skipped_no_quarter' },
    dupontTaxBurdenTtm: { action: 'skipped_no_quarter' },
    dupontInterestBurdenQ: { action: 'skipped_no_quarter' },
    dupontInterestBurdenTtm: { action: 'skipped_no_quarter' },
    dupontEbitMarginQ: { action: 'skipped_no_quarter' },
    dupontEbitMarginTtm: { action: 'skipped_no_quarter' },
    dupontExtendedRoeQ: { action: 'skipped_no_quarter' },
    dupontExtendedRoeTtm: { action: 'skipped_no_quarter' },
  };

  const resolvedQuarter =
    query.year !== undefined && query.season !== undefined
      ? { year: query.year, season: query.season }
      : await getLatestAvailableQuarter(symbol, dataType, subsidiaryCompanyId, ['balanceSheet', 'incomeStatement']);

  if (!resolvedQuarter) return skippedNoQuarter;

  const { year, season } = resolvedQuarter;
  const rocYear = Number(year);
  const seasonNum = Number(season);
  const fiscalYear = rocYearToGregorian(rocYear);

  const key = { symbol, year: rocYear, quarter: seasonNum, dataType, subsidiaryCompanyId };
  const [incomeStatement, balanceSheet] = await Promise.all([getQuarterlyIncomeStatement(key), getQuarterlyBalanceSheet(key)]);

  const netIncome = pickNetIncome(incomeStatement);
  const equity = pickEquity(balanceSheet);
  const operatingRevenue = incomeStatement?.operatingRevenue ?? null;
  const totalAssets = balanceSheet?.totalAssets ?? null;

  const netProfitMarginQuarterlyPct = netIncome.value !== null && operatingRevenue !== null ? toPct(netIncome.value, operatingRevenue) : null;
  const netProfitMarginQuarterlyNullReason: MetricNullReason | null =
    netProfitMarginQuarterlyPct === null ? determineNullReason(netIncome.value, operatingRevenue) : null;

  const assetTurnoverQuarterly = operatingRevenue !== null && totalAssets !== null ? toRatio(operatingRevenue, totalAssets) : null;
  const assetTurnoverQuarterlyAnnualized = assetTurnoverQuarterly !== null ? round2(assetTurnoverQuarterly * 4) : null;
  const assetTurnoverQuarterlyNullReason: MetricNullReason | null =
    assetTurnoverQuarterly === null ? determineNullReason(operatingRevenue, totalAssets) : null;

  const equityMultiplierValue = totalAssets !== null && equity.value !== null ? toRatio(totalAssets, equity.value) : null;
  const equityMultiplierNullReason: MetricNullReason | null = equityMultiplierValue === null ? determineNullReason(totalAssets, equity.value) : null;

  const decomposedRoeQuarterlyPct =
    netProfitMarginQuarterlyPct !== null && assetTurnoverQuarterly !== null && equityMultiplierValue !== null
      ? round2(netProfitMarginQuarterlyPct * assetTurnoverQuarterly * equityMultiplierValue)
      : null;
  // 三個因子任一為 null，不管原因為何，一律回報 missing_input——各因子自己缺漏的細節記在
  // 各自的 metric_value 列上，查歷史時可以自己對照，這裡不重複細分。
  const decomposedRoeQuarterlyNullReason: MetricNullReason | null = decomposedRoeQuarterlyPct === null ? 'missing_input' : null;

  // 五因子 Extended DuPont：把上面的 netProfitMargin 再拆成稅務負擔×利息負擔×EBIT利潤率。
  // EBIT = 稅前淨利 + 財務費用，跟 roic/roce/interestCoverage/netDebtToEbitda/evEbitda
  // 已經在用的定義一致。
  const profitBeforeTax = incomeStatement?.profitBeforeTax ?? null;
  const financeCosts = incomeStatement?.financeCosts ?? null;
  const ebit = profitBeforeTax !== null && financeCosts !== null ? profitBeforeTax + financeCosts : null;

  const dupontTaxBurdenQuarterlyPct = netIncome.value !== null && profitBeforeTax !== null ? toPct(netIncome.value, profitBeforeTax) : null;
  const dupontTaxBurdenQuarterlyNullReason: MetricNullReason | null =
    dupontTaxBurdenQuarterlyPct === null ? determineNullReason(netIncome.value, profitBeforeTax) : null;

  const dupontInterestBurdenQuarterlyPct = profitBeforeTax !== null && ebit !== null ? toPct(profitBeforeTax, ebit) : null;
  const dupontInterestBurdenQuarterlyNullReason: MetricNullReason | null =
    dupontInterestBurdenQuarterlyPct === null ? determineNullReason(profitBeforeTax, ebit) : null;

  const dupontEbitMarginQuarterlyPct = ebit !== null && operatingRevenue !== null ? toPct(ebit, operatingRevenue) : null;
  const dupontEbitMarginQuarterlyNullReason: MetricNullReason | null =
    dupontEbitMarginQuarterlyPct === null ? determineNullReason(ebit, operatingRevenue) : null;

  // 五因子相乘：dupontTaxBurdenQuarterlyPct/dupontInterestBurdenQuarterlyPct/dupontEbitMarginQuarterlyPct
  // 三個都已經是 *100 的百分比（不是原始比率），跟 assetTurnoverQuarterly/equityMultiplierValue
  // 這兩個原始比率相乘後，總共多乘了 100^2，最後除以 10000 校正回正確的百分比尺度——這是
  // 這批新增最容易踩的坑，已經用 2330 115Q2 真實數字驗證過這個公式算出來的結果精確等於
  // 既有的 dupontDecomposedRoe 基準值。
  const extendedRoeQuarterlyPct =
    dupontTaxBurdenQuarterlyPct !== null &&
    dupontInterestBurdenQuarterlyPct !== null &&
    dupontEbitMarginQuarterlyPct !== null &&
    assetTurnoverQuarterly !== null &&
    equityMultiplierValue !== null
      ? round2((dupontTaxBurdenQuarterlyPct * dupontInterestBurdenQuarterlyPct * dupontEbitMarginQuarterlyPct * assetTurnoverQuarterly * equityMultiplierValue) / 10000)
      : null;
  const extendedRoeQuarterlyNullReason: MetricNullReason | null = extendedRoeQuarterlyPct === null ? 'missing_input' : null;

  const reportDate = balanceSheet?.reportDate ?? incomeStatement?.reportDate ?? null;
  const mainAnchor = await resolveKnowledgeDate(symbol, [{ rocYear, season: seasonNum, reportDate }]);

  const coordinateFor = (metricCode: string) => ({ symbol, metricCode, fiscalYear, fiscalQuarter: seasonNum, dataType, subsidiaryCompanyId });

  let netProfitMarginQ: BasisOutcome;
  let assetTurnoverQ: BasisOutcome;
  let assetTurnoverQAnn: BasisOutcome;
  let equityMultiplierOutcome: BasisOutcome;
  let dupontDecomposedRoeQ: BasisOutcome;
  let dupontTaxBurdenQ: BasisOutcome;
  let dupontInterestBurdenQ: BasisOutcome;
  let dupontEbitMarginQ: BasisOutcome;
  let dupontExtendedRoeQ: BasisOutcome;

  if (!mainAnchor) {
    netProfitMarginQ = { action: 'skipped_no_knowledge_date' };
    assetTurnoverQ = { action: 'skipped_no_knowledge_date' };
    assetTurnoverQAnn = { action: 'skipped_no_knowledge_date' };
    equityMultiplierOutcome = { action: 'skipped_no_knowledge_date' };
    dupontDecomposedRoeQ = { action: 'skipped_no_knowledge_date' };
    dupontTaxBurdenQ = { action: 'skipped_no_knowledge_date' };
    dupontInterestBurdenQ = { action: 'skipped_no_knowledge_date' };
    dupontEbitMarginQ = { action: 'skipped_no_knowledge_date' };
    dupontExtendedRoeQ = { action: 'skipped_no_knowledge_date' };
  } else {
    const { knowledgeDate, isFallback: knowledgeDateIsFallback } = mainAnchor;
    netProfitMarginQ = await writeMetricValue({
      ...coordinateFor('netProfitMargin'),
      basis: 'Q',
      value: netProfitMarginQuarterlyPct,
      nullReason: netProfitMarginQuarterlyNullReason,
      knowledgeDate,
      knowledgeDateIsFallback,
    });
    assetTurnoverQ = await writeMetricValue({
      ...coordinateFor('assetTurnover'),
      basis: 'Q',
      value: assetTurnoverQuarterly,
      nullReason: assetTurnoverQuarterlyNullReason,
      knowledgeDate,
      knowledgeDateIsFallback,
    });
    assetTurnoverQAnn = await writeMetricValue({
      ...coordinateFor('assetTurnover'),
      basis: 'Q_ANN',
      value: assetTurnoverQuarterlyAnnualized,
      nullReason: assetTurnoverQuarterlyNullReason,
      knowledgeDate,
      knowledgeDateIsFallback,
    });
    equityMultiplierOutcome = await writeMetricValue({
      ...coordinateFor('equityMultiplier'),
      basis: 'Q',
      value: equityMultiplierValue,
      nullReason: equityMultiplierNullReason,
      knowledgeDate,
      knowledgeDateIsFallback,
    });
    dupontDecomposedRoeQ = await writeMetricValue({
      ...coordinateFor('dupontDecomposedRoe'),
      basis: 'Q',
      value: decomposedRoeQuarterlyPct,
      nullReason: decomposedRoeQuarterlyNullReason,
      knowledgeDate,
      knowledgeDateIsFallback,
    });
    dupontTaxBurdenQ = await writeMetricValue({
      ...coordinateFor('dupontTaxBurden'),
      basis: 'Q',
      value: dupontTaxBurdenQuarterlyPct,
      nullReason: dupontTaxBurdenQuarterlyNullReason,
      knowledgeDate,
      knowledgeDateIsFallback,
    });
    dupontInterestBurdenQ = await writeMetricValue({
      ...coordinateFor('dupontInterestBurden'),
      basis: 'Q',
      value: dupontInterestBurdenQuarterlyPct,
      nullReason: dupontInterestBurdenQuarterlyNullReason,
      knowledgeDate,
      knowledgeDateIsFallback,
    });
    dupontEbitMarginQ = await writeMetricValue({
      ...coordinateFor('dupontEbitMargin'),
      basis: 'Q',
      value: dupontEbitMarginQuarterlyPct,
      nullReason: dupontEbitMarginQuarterlyNullReason,
      knowledgeDate,
      knowledgeDateIsFallback,
    });
    dupontExtendedRoeQ = await writeMetricValue({
      ...coordinateFor('dupontExtendedRoe'),
      basis: 'Q',
      value: extendedRoeQuarterlyPct,
      nullReason: extendedRoeQuarterlyNullReason,
      knowledgeDate,
      knowledgeDateIsFallback,
    });
  }

  // TTM：近四季（含本季）營收/淨利加總；assetTurnover 分母沿用「本季期末總資產」（不是加總），
  // 跟 turnoverRatio.ts 的既有簡化一致。一季只要營收或淨利任一為 null 就視為該季不齊，
  // netProfitMargin/assetTurnover 的 TTM 共用同一組「資料齊不齊」判斷（比照 margins.ts）。
  const ttmQuarters = getPastNQuarters({ rocYear, season: season as Season }, 4);
  const ttmRecords = await Promise.all(
    ttmQuarters.map((tq) => getQuarterlyIncomeStatement({ symbol, year: Number(tq.year), quarter: Number(tq.season), dataType, subsidiaryCompanyId }))
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

  const netProfitMarginTtmPct = ttmComplete ? toPct(netIncomeTtmSum, revenueTtmSum) : null;
  const assetTurnoverTtmValue = ttmComplete && totalAssets !== null ? toRatio(revenueTtmSum, totalAssets) : null;

  const netProfitMarginTtmNullReason: MetricNullReason | null = ttmComplete
    ? netProfitMarginTtmPct === null
      ? determineNullReason(netIncomeTtmSum, revenueTtmSum)
      : null
    : 'insufficient_history';
  const assetTurnoverTtmNullReason: MetricNullReason | null = ttmComplete
    ? assetTurnoverTtmValue === null
      ? determineNullReason(revenueTtmSum, totalAssets)
      : null
    : 'insufficient_history';

  const decomposedRoeTtmPct =
    netProfitMarginTtmPct !== null && assetTurnoverTtmValue !== null && equityMultiplierValue !== null
      ? round2(netProfitMarginTtmPct * assetTurnoverTtmValue * equityMultiplierValue)
      : null;
  const decomposedRoeTtmNullReason: MetricNullReason | null = decomposedRoeTtmPct !== null ? null : ttmComplete ? 'missing_input' : 'insufficient_history';

  const dupontTaxBurdenTtmPct = extendedTtmComplete ? toPct(netIncomeTtmSum, preTaxTtmSum) : null;
  const dupontInterestBurdenTtmPct = extendedTtmComplete ? toPct(preTaxTtmSum, ebitTtmSum) : null;
  const dupontEbitMarginTtmPct = extendedTtmComplete ? toPct(ebitTtmSum, revenueTtmSum) : null;

  const dupontTaxBurdenTtmNullReason: MetricNullReason | null = extendedTtmComplete
    ? dupontTaxBurdenTtmPct === null
      ? determineNullReason(netIncomeTtmSum, preTaxTtmSum)
      : null
    : 'insufficient_history';
  const dupontInterestBurdenTtmNullReason: MetricNullReason | null = extendedTtmComplete
    ? dupontInterestBurdenTtmPct === null
      ? determineNullReason(preTaxTtmSum, ebitTtmSum)
      : null
    : 'insufficient_history';
  const dupontEbitMarginTtmNullReason: MetricNullReason | null = extendedTtmComplete
    ? dupontEbitMarginTtmPct === null
      ? determineNullReason(ebitTtmSum, revenueTtmSum)
      : null
    : 'insufficient_history';

  const extendedRoeTtmPct =
    dupontTaxBurdenTtmPct !== null && dupontInterestBurdenTtmPct !== null && dupontEbitMarginTtmPct !== null && assetTurnoverTtmValue !== null && equityMultiplierValue !== null
      ? round2((dupontTaxBurdenTtmPct * dupontInterestBurdenTtmPct * dupontEbitMarginTtmPct * assetTurnoverTtmValue * equityMultiplierValue) / 10000)
      : null;
  const extendedRoeTtmNullReason: MetricNullReason | null = extendedRoeTtmPct !== null ? null : extendedTtmComplete ? 'missing_input' : 'insufficient_history';

  let netProfitMarginTtm: BasisOutcome;
  let assetTurnoverTtm: BasisOutcome;
  let dupontDecomposedRoeTtm: BasisOutcome;
  let dupontTaxBurdenTtm: BasisOutcome;
  let dupontInterestBurdenTtm: BasisOutcome;
  let dupontEbitMarginTtm: BasisOutcome;
  let dupontExtendedRoeTtm: BasisOutcome;

  if (ttmComplete) {
    const ttmAnchor = await resolveKnowledgeDate(
      symbol,
      ttmQuarters.map((tq, i) => ({ rocYear: Number(tq.year), season: Number(tq.season), reportDate: ttmRecords[i]?.reportDate ?? null }))
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
      netProfitMarginTtm = await writeMetricValue({
        ...coordinateFor('netProfitMargin'),
        basis: 'TTM',
        value: netProfitMarginTtmPct,
        nullReason: netProfitMarginTtmNullReason,
        knowledgeDate,
        knowledgeDateIsFallback,
      });
      assetTurnoverTtm = await writeMetricValue({
        ...coordinateFor('assetTurnover'),
        basis: 'TTM',
        value: assetTurnoverTtmValue,
        nullReason: assetTurnoverTtmNullReason,
        knowledgeDate,
        knowledgeDateIsFallback,
      });
      dupontDecomposedRoeTtm = await writeMetricValue({
        ...coordinateFor('dupontDecomposedRoe'),
        basis: 'TTM',
        value: decomposedRoeTtmPct,
        nullReason: decomposedRoeTtmNullReason,
        knowledgeDate,
        knowledgeDateIsFallback,
      });
      // ttmComplete=true 只保證既有三因子的 TTM 齊全，五因子額外需要的稅前淨利/財務費用
      // 可能還是缺——用同一個 ttmAnchor 的 knowledge_date（季度組合相同，只是輸入完整度
      // 不同），extendedTtmComplete=false 時正確寫 null+insufficient_history，不是
      // skipped_no_knowledge_date（knowledge_date 本身是解得出來的，只是這批新因子的
      // 輸入不齊）。
      dupontTaxBurdenTtm = await writeMetricValue({
        ...coordinateFor('dupontTaxBurden'),
        basis: 'TTM',
        value: dupontTaxBurdenTtmPct,
        nullReason: dupontTaxBurdenTtmNullReason,
        knowledgeDate,
        knowledgeDateIsFallback,
      });
      dupontInterestBurdenTtm = await writeMetricValue({
        ...coordinateFor('dupontInterestBurden'),
        basis: 'TTM',
        value: dupontInterestBurdenTtmPct,
        nullReason: dupontInterestBurdenTtmNullReason,
        knowledgeDate,
        knowledgeDateIsFallback,
      });
      dupontEbitMarginTtm = await writeMetricValue({
        ...coordinateFor('dupontEbitMargin'),
        basis: 'TTM',
        value: dupontEbitMarginTtmPct,
        nullReason: dupontEbitMarginTtmNullReason,
        knowledgeDate,
        knowledgeDateIsFallback,
      });
      dupontExtendedRoeTtm = await writeMetricValue({
        ...coordinateFor('dupontExtendedRoe'),
        basis: 'TTM',
        value: extendedRoeTtmPct,
        nullReason: extendedRoeTtmNullReason,
        knowledgeDate,
        knowledgeDateIsFallback,
      });
    }
  } else if (mainAnchor) {
    const { knowledgeDate, isFallback: knowledgeDateIsFallback } = mainAnchor;
    netProfitMarginTtm = await writeMetricValue({
      ...coordinateFor('netProfitMargin'),
      basis: 'TTM',
      value: null,
      nullReason: 'insufficient_history',
      knowledgeDate,
      knowledgeDateIsFallback,
    });
    assetTurnoverTtm = await writeMetricValue({
      ...coordinateFor('assetTurnover'),
      basis: 'TTM',
      value: null,
      nullReason: 'insufficient_history',
      knowledgeDate,
      knowledgeDateIsFallback,
    });
    dupontDecomposedRoeTtm = await writeMetricValue({
      ...coordinateFor('dupontDecomposedRoe'),
      basis: 'TTM',
      value: null,
      nullReason: 'insufficient_history',
      knowledgeDate,
      knowledgeDateIsFallback,
    });
    dupontTaxBurdenTtm = await writeMetricValue({
      ...coordinateFor('dupontTaxBurden'),
      basis: 'TTM',
      value: null,
      nullReason: 'insufficient_history',
      knowledgeDate,
      knowledgeDateIsFallback,
    });
    dupontInterestBurdenTtm = await writeMetricValue({
      ...coordinateFor('dupontInterestBurden'),
      basis: 'TTM',
      value: null,
      nullReason: 'insufficient_history',
      knowledgeDate,
      knowledgeDateIsFallback,
    });
    dupontEbitMarginTtm = await writeMetricValue({
      ...coordinateFor('dupontEbitMargin'),
      basis: 'TTM',
      value: null,
      nullReason: 'insufficient_history',
      knowledgeDate,
      knowledgeDateIsFallback,
    });
    dupontExtendedRoeTtm = await writeMetricValue({
      ...coordinateFor('dupontExtendedRoe'),
      basis: 'TTM',
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

  return {
    symbol,
    rocYear: year,
    season,
    netProfitMarginQ,
    netProfitMarginTtm,
    assetTurnoverQ,
    assetTurnoverQAnn,
    assetTurnoverTtm,
    equityMultiplier: equityMultiplierOutcome,
    dupontDecomposedRoeQ,
    dupontDecomposedRoeTtm,
    dupontTaxBurdenQ,
    dupontTaxBurdenTtm,
    dupontInterestBurdenQ,
    dupontInterestBurdenTtm,
    dupontEbitMarginQ,
    dupontEbitMarginTtm,
    dupontExtendedRoeQ,
    dupontExtendedRoeTtm,
  };
};
