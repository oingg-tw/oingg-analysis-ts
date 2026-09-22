import { resolveQuarterOrLatest } from '@/application/financials/latestQuarter';
import { pickNetIncomeValue as pickNetIncome } from '@/domain/metrics/shared/pickers';
import { getPastNQuarters, rocYearToGregorian, type Season } from '@/domain/calendar/rocQuarter';
import type { QuarterlyMetricQuery } from '@/domain/financials/quarterlyMetric';
import { resolveKnowledgeDate } from '../../knowledgeDate';
import type { MetricNullReason } from '../../../../domain/metrics/metricBasis';
import { periodTypeGroup } from '@/domain/metrics/coordinate';
import { computation, type ComputationBatch, type ComputationSlot, noQuarterBatch } from '@/domain/metrics/computation';
import type { PitDeps } from '@/application/metrics/deps';

// 這份檔案是 src/domainMetrics/ohlsonOScore.ts 的獨立重新實作。Logit 財務危機預警模型：
// O = -1.32 - 0.407*SIZE + 6.03*TLTA - 1.43*WCTA + 0.0757*CLCA - 1.72*OENEG - 2.37*NITA
//     - 1.83*FUTL + 0.285*INTWO - 0.521*CHIN
// NITA/FUTL/INTWO/CHIN 需要「本年 TTM」跟「去年同季 TTM」兩個窗口——去年同季錨點比照
// piotroskiFScore/beneishMScore 用 getPastNQuarters({rocYear,season},5)[0]，再用那個錨點
// 建去年的 TTM 窗口（getPastNQuarters(...,4)）。只有 TTM 一種 basis。只遷移 oScore，
// probabilityOfBankruptcy（純函式轉換）跟 9 個內部變量不獨立遷移。

const sumNetIncome = (records: ({ netIncomeAttributableToParent: bigint | null; netIncome: bigint | null } | null)[]): bigint | null => {
  let sum = 0n;
  for (const record of records) {
    const value = pickNetIncome(record);
    if (value === null) return null;
    sum += value;
  }
  return sum;
};

const round4 = (x: number): number => Math.round(x * 10000) / 10000;


export type OhlsonOScoreDeps = Pick<PitDeps, 'statements' | 'quarters' | 'announcements' | 'industry' | 'priceLevel'>;

// 2026-09-22 formulaVersion 2（公式稽核第 ③ 項，使用者拍板照原文換算）：SIZE = log(總資產 ÷ GNP 物價指數)，Ohlson (1980)
// 原文「Total assets are as reported in dollars」、「The index assumes a base value of 100 for 1968」。單位判讀用 Ohlson 自己的
// 最適切點反推：他的樣本最適機率切點 0.038 ↔ O ≈ −3.2，健康公司要落在 −5 附近，只有「美元（不是千元）÷ 1968=100 的指數」
// 這種讀法會讓 1970 年代一家 1 億美元的公司 SIZE ≈ 13、O ≈ −5；改成千元或指數不乘 100 都會差 ln(1000) 或 ln(100)。
// v1 直接 ln(新台幣千元)：對 2330 是 22.7，換算後 19.6，Δ −3.1 × −0.407 → O 系統性低約 1.3（小公司差更多），全市場
// 看起來都比實際安全（2026Q2 中位數 −5.8）。換算：SIZE = ln( TA_千元新台幣 × 1000 ÷ 匯率 ÷ (GNPDEF_q ÷ GNPDEF_1968 × 100) )，
// 匯率取季末當天或之前最近一筆銀行間收盤價（序列落後約一個月），GNPDEF 取該季 FRED 原值（2017=100，1968 四季平均 18.243）。
// 查無匯率或指數 → missing_input。資料來源見 application/ports/priceLevel.ts。
export const OHLSON_O_SCORE_FORMULA_VERSION = 2;
const quarterEndDate = (rocYear: number, quarter: number): Date => new Date(Date.UTC(rocYearToGregorian(rocYear), quarter * 3, 0));


export type OhlsonOScoreComputationBatch = ComputationBatch<'ttm'>;

export const computeOhlsonOScore = async (query: QuarterlyMetricQuery, deps: OhlsonOScoreDeps): Promise<OhlsonOScoreComputationBatch> => {
  const { symbol, dataType, subsidiaryCompanyId } = query;

  const resolvedQuarter = await resolveQuarterOrLatest(query, ['balanceSheet', 'incomeStatement', 'cashFlowStatement'], deps.quarters);

  if (!resolvedQuarter) {
    return noQuarterBatch(symbol, ['ttm']);
  }

  const { year, season } = resolvedQuarter;
  const rocYear = Number(year);
  const seasonNum = Number(season);
  const fiscalYear = rocYearToGregorian(rocYear);

  const thisYearTtmQuarters = getPastNQuarters({ rocYear, season: season as Season }, 4);
  const priorYearAnchor = getPastNQuarters({ rocYear, season: season as Season }, 5)[0]!;
  const priorYearTtmQuarters = getPastNQuarters({ rocYear: Number(priorYearAnchor.year), season: priorYearAnchor.season }, 4);

  const balanceSheetKey = { symbol, year: rocYear, quarter: seasonNum, dataType, subsidiaryCompanyId };
  const fetchIncomeStatement = (tq: { year: string; season: Season }) =>
    deps.statements.getIncomeStatement({ symbol, year: Number(tq.year), quarter: Number(tq.season), dataType, subsidiaryCompanyId });
  const fetchCashFlow = (tq: { year: string; season: Season }) =>
    deps.statements.getCashFlowStatement({ symbol, year: Number(tq.year), quarter: Number(tq.season), dataType, subsidiaryCompanyId });

  const [balanceSheet, thisYearIncomeRecords, priorYearIncomeRecords, thisYearCashFlowRecords] = await Promise.all([
    deps.statements.getBalanceSheet(balanceSheetKey),
    Promise.all(thisYearTtmQuarters.map(fetchIncomeStatement)),
    Promise.all(priorYearTtmQuarters.map(fetchIncomeStatement)),
    Promise.all(thisYearTtmQuarters.map(fetchCashFlow)),
  ]);

  const totalAssets = balanceSheet?.totalAssets ?? null;
  const totalLiabilities = balanceSheet?.totalLiabilities ?? null;
  const currentAssets = balanceSheet?.currentAssets ?? null;
  const currentLiabilities = balanceSheet?.currentLiabilities ?? null;
  const reportDate = balanceSheet?.reportDate ?? null;

  const netIncomeTtm = sumNetIncome(thisYearIncomeRecords);
  const netIncomeTtmPriorYear = sumNetIncome(priorYearIncomeRecords);

  let operatingCashFlowTtm: bigint | null = 0n;
  for (const record of thisYearCashFlowRecords) {
    if (!record || record.netCashFromOperatingActivities === null) {
      operatingCashFlowTtm = null;
      break;
    }
    operatingCashFlowTtm += record.netCashFromOperatingActivities;
  }

  const [usdTwd, deflator, deflatorBase] = await Promise.all([
    deps.priceLevel.getUsdTwdRateAsOf(quarterEndDate(rocYear, seasonNum)),
    deps.priceLevel.getUsGnpDeflator(fiscalYear, seasonNum),
    deps.priceLevel.getUsGnpDeflatorBase1968(),
  ]);
  const priceLevelAvailable = usdTwd !== null && usdTwd > 0 && deflator !== null && deflator > 0 && deflatorBase !== null && deflatorBase > 0;
  const size =
    totalAssets !== null && totalAssets > 0n && priceLevelAvailable ? round4(Math.log((Number(totalAssets) * 1000) / usdTwd / ((deflator / deflatorBase) * 100))) : null;
  const tlta = totalAssets !== null && totalLiabilities !== null && totalAssets !== 0n ? round4(Number(totalLiabilities) / Number(totalAssets)) : null;
  const wcta =
    totalAssets !== null && currentAssets !== null && currentLiabilities !== null && totalAssets !== 0n
      ? round4((Number(currentAssets) - Number(currentLiabilities)) / Number(totalAssets))
      : null;
  const clca = currentAssets !== null && currentLiabilities !== null && currentAssets !== 0n ? round4(Number(currentLiabilities) / Number(currentAssets)) : null;
  const oeneg = totalAssets !== null && totalLiabilities !== null ? (totalLiabilities > totalAssets ? 1 : 0) : null;
  const nita = netIncomeTtm !== null && totalAssets !== null && totalAssets !== 0n ? round4(Number(netIncomeTtm) / Number(totalAssets)) : null;
  const futl =
    operatingCashFlowTtm !== null && totalLiabilities !== null && totalLiabilities !== 0n ? round4(Number(operatingCashFlowTtm) / Number(totalLiabilities)) : null;
  const intwo = netIncomeTtm !== null && netIncomeTtmPriorYear !== null ? (netIncomeTtm < 0n && netIncomeTtmPriorYear < 0n ? 1 : 0) : null;
  const chin =
    netIncomeTtm !== null && netIncomeTtmPriorYear !== null && (netIncomeTtm !== 0n || netIncomeTtmPriorYear !== 0n)
      ? round4(Number(netIncomeTtm - netIncomeTtmPriorYear) / (Math.abs(Number(netIncomeTtm)) + Math.abs(Number(netIncomeTtmPriorYear))))
      : null;

  const variables = [size, tlta, wcta, clca, oeneg, nita, futl, intwo, chin];
  let oScore = variables.every((v) => v !== null)
    ? round4(-1.32 - 0.407 * size! + 6.03 * tlta! - 1.43 * wcta! + 0.0757 * clca! - 1.72 * oeneg! - 2.37 * nita! - 1.83 * futl! + 0.285 * intwo! - 0.521 * chin!)
    : null;

  const ttmComplete = netIncomeTtm !== null && netIncomeTtmPriorYear !== null && operatingCashFlowTtm !== null;

  let nullReason: MetricNullReason | null = null;
  if (oScore === null) {
    if (!ttmComplete) nullReason = 'insufficient_history';
    else if (totalAssets === null || totalLiabilities === null || currentAssets === null || currentLiabilities === null || !priceLevelAvailable) nullReason = 'missing_input';
    else nullReason = 'zero_or_negative_denominator';
  }

  // 2026-09-13：模型本身不適用金融保險業（見 isFinancialIndustryCompany 的說明），
  // 蓋過原本算出來的結果，不是資料缺漏。
  if (await deps.industry.isFinancialIndustryCompany(symbol)) {
    oScore = null;
    nullReason = 'not_applicable_industry';
  }

  const coordinateBase = { symbol, metricCode: 'ohlsonOScore', fiscalYear, fiscalQuarter: seasonNum, dataType, subsidiaryCompanyId };

  let ttm: ComputationSlot;
  if (ttmComplete) {
    const ttmAnchor = await resolveKnowledgeDate(symbol, [
      ...thisYearTtmQuarters.map((tq, i) => ({ rocYear: Number(tq.year), season: Number(tq.season), reportDate: thisYearIncomeRecords[i]?.reportDate ?? null })),
      ...priorYearTtmQuarters.map((tq, i) => ({ rocYear: Number(tq.year), season: Number(tq.season), reportDate: priorYearIncomeRecords[i]?.reportDate ?? null })),
    ], deps.announcements);
    if (!ttmAnchor) {
      ttm = { action: 'skipped_no_knowledge_date' };
    } else {
      ttm = computation({
        ...coordinateBase,
        ...periodTypeGroup('TTM'),
        value: oScore,
        nullReason,
        knowledgeDate: ttmAnchor.knowledgeDate,
        knowledgeDateIsFallback: ttmAnchor.isFallback,
        formulaVersion: OHLSON_O_SCORE_FORMULA_VERSION,
      });
    }
  } else {
    const mainAnchor = await resolveKnowledgeDate(symbol, [{ rocYear, season: seasonNum, reportDate }], deps.announcements);
    if (!mainAnchor) {
      ttm = { action: 'skipped_no_knowledge_date' };
    } else {
      ttm = computation({
        ...coordinateBase,
        ...periodTypeGroup('TTM'),
        value: null,
        // 沿用上面算好的 nullReason（金融保險業會是 not_applicable_industry），
        // 不要重新硬寫死 insufficient_history。
        nullReason,
        knowledgeDate: mainAnchor.knowledgeDate,
        knowledgeDateIsFallback: mainAnchor.isFallback,
        formulaVersion: OHLSON_O_SCORE_FORMULA_VERSION,
      });
    }
  }

  return { symbol, rocYear: year, season, slots: { ttm } };
};
