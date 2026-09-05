import { analysisPrisma } from '@/adapters/prisma/analysisClient';
import { getPastNQuarters, type Season } from '@/shared/rocQuarter';
import { getLatestAvailableQuarter } from '@/shared/sourceData/latestQuarter';
import { getQuarterlyBalanceSheet, getQuarterlyCashFlowStatement, getQuarterlyIncomeStatement } from '@/shared/sourceData/mopsQuarterlyStatements';
import { buildFieldStatuses, type MetricStatus, type MetricResultMeta } from '@/shared/metricStatus';
import type { QuarterlyMetricQuery, QuarterlyMetricIdentity, QuarterlyMetricTtmInfo } from '@/shared/quarterlyMetric';
import { logger } from '@/shared/logger';

// year/season 選填但要成對——不給就自動抓「這家公司資產負債表/損益表/現金流量表都有資料」的
// 最新一季（見 shared/sourceData/latestQuarter.ts），只給其中一個視為無效請求（在 controller 用 zod refine 擋掉）。
export type OhlsonOScoreQuery = QuarterlyMetricQuery;

export interface OhlsonOScoreResult extends QuarterlyMetricIdentity, MetricResultMeta {
  // James Ohlson（1980）Logit 財務危機預警模型：
  // O = -1.32 - 0.407*SIZE + 6.03*TLTA - 1.43*WCTA + 0.0757*CLCA - 1.72*OENEG
  //     - 2.37*NITA - 1.83*FUTL + 0.285*INTWO - 0.521*CHIN
  oScore: number | null;
  // probabilityOfBankruptcy = 1 / (1 + e^(-O))，Logit 模型的標準機率轉換，比單看 O 這個沒有
  // 直覺單位的分數好解讀。
  probabilityOfBankruptcy: number | null;
  // 門檻是原始論文定的，不是本服務自訂：probabilityOfBankruptcy > 0.5（等同 oScore > 0）判斷為
  // 財務危機風險較高。
  flagged: boolean | null;

  size: number | null; // ln(總資產)——原始論文用 GNP 物價指數平減過的資產，本服務用未平減的原始總資產，見下方說明
  tlta: number | null; // 總負債 / 總資產
  wcta: number | null; // (流動資產 - 流動負債) / 總資產
  clca: number | null; // 流動負債 / 流動資產
  oeneg: number | null; // 總負債 > 總資產 記 1，否則記 0（權益為負的訊號）
  nita: number | null; // 淨利（TTM） / 總資產
  futl: number | null; // 營運現金流（TTM，FFO 的代理變數） / 總負債
  intwo: number | null; // 今年、去年 TTM 淨利都是負數記 1，否則記 0
  chin: number | null; // (今年 TTM 淨利 - 去年 TTM 淨利) / (|今年| + |去年|)

  netIncomeTtm: { value: string | null }; // BigInt as string；本季往前 4 季（含本季）加總
  netIncomeTtmPriorYear: { value: string | null }; // BigInt as string；去年同季往前 4 季加總
  operatingCashFlowTtm: { value: string | null }; // BigInt as string；本季往前 4 季（含本季）加總
  totalAssets: { value: string | null };
  totalLiabilities: { value: string | null };
  currentAssets: { value: string | null };
  currentLiabilities: { value: string | null };

  ttm: QuarterlyMetricTtmInfo;
}

const round4 = (x: number): number => Math.round(x * 10000) / 10000;

// 淨利欄位選擇邏輯跟 ROE/ROA/ZmijewskiScore 一致：優先採用「歸屬於母公司」口徑，缺漏時退回用整體數字。
const pickNetIncome = (record: { netIncomeAttributableToParent: bigint | null; netIncome: bigint | null } | null): bigint | null => {
  if (!record) return null;
  if (record.netIncomeAttributableToParent !== null) return record.netIncomeAttributableToParent;
  return record.netIncome;
};

// 加總某一組季度的淨利，回傳 { sum, quartersUsed, quartersMissing, complete }——本季 TTM、去年同季
// TTM 都用同一個邏輯算，只是餵進去的季度清單不同。
const sumNetIncome = (
  quarters: { year: string; season: Season }[],
  records: ({ netIncomeAttributableToParent: bigint | null; netIncome: bigint | null } | null)[]
): { sum: bigint | null; quartersUsed: string[]; quartersMissing: string[] } => {
  const quartersUsed: string[] = [];
  const quartersMissing: string[] = [];
  let sum = 0n;
  quarters.forEach((q, i) => {
    const label = `${q.year}Q${q.season}`;
    const value = pickNetIncome(records[i] ?? null);
    if (value === null) {
      quartersMissing.push(label);
    } else {
      quartersUsed.push(label);
      sum += value;
    }
  });
  return { sum: quartersMissing.length === 0 ? sum : null, quartersUsed, quartersMissing };
};

const emptyResult = (symbol: string, dataType: '1' | '2', subsidiaryCompanyId: string, warnings: string[]): OhlsonOScoreResult => ({
  symbol,
  year: null,
  season: null,
  dataType,
  subsidiaryCompanyId,
  reportDate: null,
  oScore: null,
  probabilityOfBankruptcy: null,
  flagged: null,
  size: null,
  tlta: null,
  wcta: null,
  clca: null,
  oeneg: null,
  nita: null,
  futl: null,
  intwo: null,
  chin: null,
  netIncomeTtm: { value: null },
  netIncomeTtmPriorYear: { value: null },
  operatingCashFlowTtm: { value: null },
  totalAssets: { value: null },
  totalLiabilities: { value: null },
  currentAssets: { value: null },
  currentLiabilities: { value: null },
  ttm: { quartersUsed: [], quartersMissing: [] },
  fieldStatuses: buildFieldStatuses([]),
  warnings,
});

export const calculateOhlsonOScore = async (query: OhlsonOScoreQuery): Promise<OhlsonOScoreResult> => {
  const { symbol, dataType, subsidiaryCompanyId } = query;
  const warnings: string[] = [];

  // year/season 沒指定時，自動抓「這家公司資產負債表/損益表/現金流量表都有資料」的最新一季，
  // 見 shared/sourceData/latestQuarter.ts。
  const resolvedQuarter =
    query.year !== undefined && query.season !== undefined
      ? { year: query.year, season: query.season }
      : await getLatestAvailableQuarter(symbol, dataType, subsidiaryCompanyId, ['balanceSheet', 'incomeStatement', 'cashFlowStatement']);
  if (!resolvedQuarter) {
    return emptyResult(symbol, dataType, subsidiaryCompanyId, [
      '查無任何一季資產負債表/損益表/現金流量表都有資料的季度，無法決定要用哪一季計算 Ohlson O-Score。',
    ]);
  }
  const { year, season } = resolvedQuarter;
  const yearNum = Number(year);
  const seasonNum = Number(season);

  const balanceSheetKey = { symbol: symbol, year: yearNum, quarter: seasonNum, dataType, subsidiaryCompanyId };

  // INTWO/CHIN 需要「今年 TTM 淨利」跟「去年同季 TTM 淨利」——去年同季是用 getPastNQuarters 往前推
  // 5 季（含本季）取最舊那一筆，跟 Piotroski/Beneish 定位「去年同季」同一個 helper、同一種用法。
  const thisYearTtmQuarters = getPastNQuarters({ rocYear: yearNum, season }, 4);
  const priorYearAnchor = getPastNQuarters({ rocYear: yearNum, season }, 5)[0]!;
  const priorYearTtmQuarters = getPastNQuarters({ rocYear: Number(priorYearAnchor.year), season: priorYearAnchor.season }, 4);

  const fetchIncomeStatement = (q: { year: string; season: Season }) =>
    getQuarterlyIncomeStatement({
      symbol: symbol,
      year: Number(q.year),
      quarter: Number(q.season),
      dataType,
      subsidiaryCompanyId,
    });
  const fetchCashFlow = (q: { year: string; season: Season }) =>
    getQuarterlyCashFlowStatement({
      symbol: symbol,
      year: Number(q.year),
      quarter: Number(q.season),
      dataType,
      subsidiaryCompanyId,
    });

  const [balanceSheet, thisYearIncomeRecords, priorYearIncomeRecords, thisYearCashFlowRecords] = await Promise.all([
    getQuarterlyBalanceSheet(balanceSheetKey),
    Promise.all(thisYearTtmQuarters.map(fetchIncomeStatement)),
    Promise.all(priorYearTtmQuarters.map(fetchIncomeStatement)),
    Promise.all(thisYearTtmQuarters.map(fetchCashFlow)),
  ]);

  if (!balanceSheet) warnings.push('查無該季資產負債表資料。');

  const totalAssets = balanceSheet?.totalAssets ?? null;
  const totalLiabilities = balanceSheet?.totalLiabilities ?? null;
  const currentAssets = balanceSheet?.currentAssets ?? null;
  const currentLiabilities = balanceSheet?.currentLiabilities ?? null;
  if (balanceSheet && totalAssets === null) warnings.push('該季資產負債表總資產欄位為 null，無法計算。');
  if (balanceSheet && totalLiabilities === null) warnings.push('該季資產負債表總負債欄位為 null，無法計算。');
  if (balanceSheet && (currentAssets === null || currentLiabilities === null)) {
    warnings.push('該季資產負債表流動資產/流動負債欄位為 null——常見於金融/保險業（資產負債表不按流動/非流動分類），WCTA/CLCA 無法計算。');
  }

  const { sum: netIncomeTtm, quartersUsed, quartersMissing } = sumNetIncome(thisYearTtmQuarters, thisYearIncomeRecords);
  if (netIncomeTtm === null) warnings.push(`近四季損益表資料不齊（缺: ${quartersMissing.join(', ')}），無法計算本季 TTM 淨利，NITA/INTWO/CHIN 無法計算。`);

  const { sum: netIncomeTtmPriorYear, quartersMissing: priorYearQuartersMissing } = sumNetIncome(priorYearTtmQuarters, priorYearIncomeRecords);
  if (netIncomeTtmPriorYear === null) {
    warnings.push(`去年同季往前四季損益表資料不齊（缺: ${priorYearQuartersMissing.join(', ')}），無法計算去年 TTM 淨利，INTWO/CHIN 無法計算。`);
  }

  // FFO（Funds From Operations）財報沒有現成欄位，用營運現金流（OCF）當代理變數——常見的實務替代做法，
  // 跟 Beneish AQI 省略證券項、DEPI 只用 depreciation 是同一種「用現有欄位近似原始定義」的簡化。
  let operatingCashFlowTtm: bigint | null = 0n;
  let ocfComplete = true;
  thisYearCashFlowRecords.forEach((record) => {
    if (!record || record.netCashFromOperatingActivities === null) {
      ocfComplete = false;
    } else if (operatingCashFlowTtm !== null) {
      operatingCashFlowTtm += record.netCashFromOperatingActivities;
    }
  });
  if (!ocfComplete) {
    operatingCashFlowTtm = null;
    warnings.push('近四季現金流量表營運現金流欄位不齊，無法計算 TTM 營運現金流，FUTL 無法計算。');
  }

  const size = totalAssets !== null && totalAssets > 0n ? round4(Math.log(Number(totalAssets))) : null;
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

  let oScore: number | null = null;
  let probabilityOfBankruptcy: number | null = null;
  let flagged: boolean | null = null;
  if (size !== null && tlta !== null && wcta !== null && clca !== null && oeneg !== null && nita !== null && futl !== null && intwo !== null && chin !== null) {
    oScore = round4(-1.32 - 0.407 * size + 6.03 * tlta - 1.43 * wcta + 0.0757 * clca - 1.72 * oeneg - 2.37 * nita - 1.83 * futl + 0.285 * intwo - 0.521 * chin);
    probabilityOfBankruptcy = round4(1 / (1 + Math.exp(-oScore)));
    flagged = probabilityOfBankruptcy > 0.5;
  }

  const reportDate = balanceSheet?.reportDate ?? null;

  const fieldStatusEntries: Array<[string, MetricStatus] | null> = [
    size === null ? ['size', { status: 'no_data', message: '總資產缺漏或非正數，無法計算 SIZE。' }] : null,
    nita === null ? ['nita', { status: 'no_data', message: 'TTM 淨利或總資產缺漏，無法計算 NITA。' }] : null,
    futl === null ? ['futl', { status: 'no_data', message: 'TTM 營運現金流或總負債缺漏，無法計算 FUTL。' }] : null,
    intwo === null ? ['intwo', { status: 'no_data', message: '今年或去年 TTM 淨利缺漏，無法計算 INTWO。' }] : null,
    chin === null ? ['chin', { status: 'no_data', message: '今年或去年 TTM 淨利缺漏，無法計算 CHIN。' }] : null,
    oScore === null ? ['oScore', { status: 'no_data', message: 'SIZE/TLTA/WCTA/CLCA/OENEG/NITA/FUTL/INTWO/CHIN 任一為 null，無法計算 O-Score。' }] : null,
  ];

  // 存進 oingg-analysis DB 的 guru_ohlson_o_score，供之後查歷史紀錄用。存檔失敗不應該讓已經算好的結果回傳失敗。
  try {
    await analysisPrisma.ohlsonOScoreResult.upsert({
      where: {
        symbol_year_season_dataType_subsidiaryCompanyId: { symbol: symbol, year: yearNum, season: seasonNum, dataType, subsidiaryCompanyId },
      },
      create: {
        symbol: symbol,
        year: yearNum,
        season: seasonNum,
        dataType,
        subsidiaryCompanyId,
        reportDate,
        oScore,
        probabilityOfBankruptcy,
        flagged,
        size,
        tlta,
        wcta,
        clca,
        oeneg,
        nita,
        futl,
        intwo,
        chin,
        netIncomeTtmValue: netIncomeTtm,
        netIncomeTtmPriorYearValue: netIncomeTtmPriorYear,
        operatingCashFlowTtmValue: operatingCashFlowTtm,
        totalAssetsValue: totalAssets,
        totalLiabilitiesValue: totalLiabilities,
        currentAssetsValue: currentAssets,
        currentLiabilitiesValue: currentLiabilities,
        warnings,
      },
      update: {
        reportDate,
        oScore,
        probabilityOfBankruptcy,
        flagged,
        size,
        tlta,
        wcta,
        clca,
        oeneg,
        nita,
        futl,
        intwo,
        chin,
        netIncomeTtmValue: netIncomeTtm,
        netIncomeTtmPriorYearValue: netIncomeTtmPriorYear,
        operatingCashFlowTtmValue: operatingCashFlowTtm,
        totalAssetsValue: totalAssets,
        totalLiabilitiesValue: totalLiabilities,
        currentAssetsValue: currentAssets,
        currentLiabilitiesValue: currentLiabilities,
        warnings,
      },
    });
  } catch (error) {
    logger.error({ err: error }, '[ohlson-o-score]: 寫入 guru_ohlson_o_score 失敗，不影響本次回傳結果。');
  }

  return {
    symbol,
    year,
    season,
    dataType,
    subsidiaryCompanyId,
    reportDate: reportDate?.toISOString().slice(0, 10) ?? null,
    oScore,
    probabilityOfBankruptcy,
    flagged,
    size,
    tlta,
    wcta,
    clca,
    oeneg,
    nita,
    futl,
    intwo,
    chin,
    netIncomeTtm: { value: netIncomeTtm?.toString() ?? null },
    netIncomeTtmPriorYear: { value: netIncomeTtmPriorYear?.toString() ?? null },
    operatingCashFlowTtm: { value: operatingCashFlowTtm?.toString() ?? null },
    totalAssets: { value: totalAssets?.toString() ?? null },
    totalLiabilities: { value: totalLiabilities?.toString() ?? null },
    currentAssets: { value: currentAssets?.toString() ?? null },
    currentLiabilities: { value: currentLiabilities?.toString() ?? null },
    ttm: { quartersUsed, quartersMissing },
    fieldStatuses: buildFieldStatuses(fieldStatusEntries),
    warnings,
  };
};
