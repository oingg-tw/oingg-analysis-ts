import { analysisPrisma } from '@/adapters/prisma/analysisClient';
import { calculateRoe } from '@/domainMetrics/roe';
import { negativeEquityWarning } from '@/shared/negativeEquityGuard';
import { getPastNQuarters } from '@/shared/rocQuarter';
import { getLatestAvailableQuarter } from '@/shared/sourceData/latestQuarter';
import { getQuarterlyBalanceSheet, getQuarterlyIncomeStatement } from '@/shared/sourceData/mopsQuarterlyStatements';
import { buildFieldStatuses, type MetricStatus, type MetricResultMeta } from '@/shared/metricStatus';
import type { QuarterlyMetricQuery, QuarterlyMetricIdentity, QuarterlyMetricTtmInfo } from '@/shared/quarterlyMetric';
import { logger } from '@/shared/logger';

// year/season 選填但要成對——不給就自動抓「這家公司資產負債表跟損益表都有資料」的最新一季
// （見 shared/sourceData/latestQuarter.ts），只給其中一個視為無效請求（在 controller 用 zod refine 擋掉）。
export type NissimPenmanRnoaQuery = QuarterlyMetricQuery;

export interface NissimPenmanRnoaResult extends QuarterlyMetricIdentity, MetricResultMeta {
  // ROE = RNOA + (FLEV x SPREAD)。
  // RNOA（本業報酬率） = NOPAT / NOA，跟 ROE/ROIC 同一種單季/年化/TTM 三數值結構。
  rnoaQuarterlyPct: number | null;
  rnoaQuarterlyAnnualizedPct: number | null;
  rnoaTtmPct: number | null;

  // FLEV（財務槓桿） = NFO / 權益，純資產負債表時點快照，單季/TTM 共用同一個值——跟 dupont 的
  // equityMultiplier 是同一種道理。是原始比率（倍數），不是百分比。
  flev: number | null;

  // NBC（淨借貸利率） = 利息費用 / NFO；SPREAD = RNOA - NBC。都分單季/TTM，用來配對同期的 RNOA。
  nbcQuarterlyPct: number | null;
  nbcTtmPct: number | null;
  spreadQuarterlyPct: number | null;
  spreadTtmPct: number | null;

  // 用 RNOA + FLEV x SPREAD 重新組裝出來的 ROE，理論上應該接近（不必完全相等）roe/ 直接算出來、
  // 原樣回傳的 actualRoeQuarterlyPct/actualRoeTtmPct——兩者對照可以互相驗證拆解邏輯是否一致，
  // 小數點誤差是四捨五入造成的正常現象，跟 dupont 的交叉驗證設計同一個精神。
  reconstructedRoeQuarterlyPct: number | null;
  reconstructedRoeTtmPct: number | null;
  actualRoeQuarterlyPct: number | null;
  actualRoeTtmPct: number | null;

  nopat: {
    value: string | null; // BigInt as string（四捨五入到整數）；本季 NOPAT = 營業利益 x (1 - 有效稅率)
  };
  nopatTtm: {
    value: string | null; // BigInt as string；近四季加總，資料不齊則為 null
  };
  noa: {
    value: string | null; // BigInt as string；淨營業資產 = 權益 + NFO
  };
  nfo: {
    value: string | null; // BigInt as string；淨金融負債 = 有息負債 - 現金及約當現金
  };
  equity: {
    fieldUsed: 'equityAttributableToParent' | 'totalEquity' | null;
    value: string | null; // BigInt as string
  };

  ttm: QuarterlyMetricTtmInfo;
}

const toPct = (numerator: bigint, denominator: bigint): number | null => {
  if (denominator === 0n) return null;
  return Math.round((Number(numerator) / Number(denominator)) * 100 * 100) / 100; // 四捨五入到小數 2 位
};

const toRatio = (numerator: bigint, denominator: bigint): number | null => {
  if (denominator === 0n) return null;
  return Math.round((Number(numerator) / Number(denominator)) * 10000) / 10000; // 保留 4 位小數（原始比率，不是百分比）
};

const round2 = (x: number): number => Math.round(x * 100) / 100;

// 權益欄位選擇邏輯跟 ROE/ROIC/deRatio 一致：優先採用「歸屬於母公司」口徑，缺漏時退回用整體數字。
const pickEquity = (
  record: { equityAttributableToParent: bigint | null; totalEquity: bigint | null } | null
): { field: 'equityAttributableToParent' | 'totalEquity' | null; value: bigint | null } => {
  if (!record) return { field: null, value: null };
  if (record.equityAttributableToParent !== null) return { field: 'equityAttributableToParent', value: record.equityAttributableToParent };
  if (record.totalEquity !== null) return { field: 'totalEquity', value: record.totalEquity };
  return { field: null, value: null };
};

interface IncomeStatementSlice {
  operatingIncome: bigint | null;
  profitBeforeTax: bigint | null;
  incomeTaxExpense: bigint | null;
  financeCosts: bigint | null;
  interestIncome: bigint | null;
}

// 有效稅率 = 所得稅費用 / 稅前淨利，稅前淨利為零或負數時有效稅率沒有意義，回傳 null。
const calculateEffectiveTaxRate = (record: IncomeStatementSlice | null): number | null => {
  if (!record || record.profitBeforeTax === null || record.incomeTaxExpense === null) return null;
  if (record.profitBeforeTax <= 0n) return null;
  return Number(record.incomeTaxExpense) / Number(record.profitBeforeTax);
};

// NOPAT = 營業利益 x (1 - 有效稅率)。跟 roic/ 的 NOPAT 算法差別只在分子用 operatingIncome 不是
// EBIT（稅前淨利+利息費用反推）——operatingIncome 是財報現成欄位，不用反推，見 guru/README.md。
const calculateNopat = (record: IncomeStatementSlice | null): bigint | null => {
  const effectiveTaxRate = calculateEffectiveTaxRate(record);
  if (!record || record.operatingIncome === null || effectiveTaxRate === null) return null;
  return BigInt(Math.round(Number(record.operatingIncome) * (1 - effectiveTaxRate)));
};

// NBC 用的是「稅後淨利息費用」，不是毛的利息費用：(1) 淨額——利息費用要扣掉利息收入
// （financeCosts - interestIncome），因為 NFO 本身也是淨額（有息負債 - 現金），現金賺的利息收入
// 理當算進同一個「金融活動」的淨損益，不能只算負債那一邊的利息費用，否則對現金部位很大的公司
// （例如台積電利息收入是利息費用的 10 倍）NBC 會嚴重失真。(2) 稅後——用跟 NOPAT 一樣的有效稅率
// 把稅盾效果扣掉，這樣 ROE = RNOA + FLEV x SPREAD 這個恆等式才會對得起來。
const calculateAfterTaxNetInterestExpense = (record: IncomeStatementSlice | null): bigint | null => {
  const effectiveTaxRate = calculateEffectiveTaxRate(record);
  if (!record || record.financeCosts === null || record.interestIncome === null || effectiveTaxRate === null) return null;
  const netInterestExpense = record.financeCosts - record.interestIncome;
  return BigInt(Math.round(Number(netInterestExpense) * (1 - effectiveTaxRate)));
};

// 一季「算得出 NOPAT 也算得出稅後利息費用」才視為 TTM 齊——NBC/SPREAD 的 TTM 版本共用同一份
// 「季度是否齊全」判斷，不再另外維護一組缺季清單，避免 NOPAT 跟利息費用各自缺不同季時
// quartersUsed/quartersMissing 對不起來。
const isQuarterComplete = (record: IncomeStatementSlice | null): boolean =>
  calculateNopat(record) !== null && calculateAfterTaxNetInterestExpense(record) !== null;

const emptyResult = (symbol: string, dataType: '1' | '2', subsidiaryCompanyId: string, warnings: string[]): NissimPenmanRnoaResult => ({
  symbol,
  year: null,
  season: null,
  dataType,
  subsidiaryCompanyId,
  reportDate: null,
  rnoaQuarterlyPct: null,
  rnoaQuarterlyAnnualizedPct: null,
  rnoaTtmPct: null,
  flev: null,
  nbcQuarterlyPct: null,
  nbcTtmPct: null,
  spreadQuarterlyPct: null,
  spreadTtmPct: null,
  reconstructedRoeQuarterlyPct: null,
  reconstructedRoeTtmPct: null,
  actualRoeQuarterlyPct: null,
  actualRoeTtmPct: null,
  nopat: { value: null },
  nopatTtm: { value: null },
  noa: { value: null },
  nfo: { value: null },
  equity: { fieldUsed: null, value: null },
  ttm: { quartersUsed: [], quartersMissing: [] },
  fieldStatuses: buildFieldStatuses([]),
  warnings,
});

export const calculateNissimPenmanRnoa = async (query: NissimPenmanRnoaQuery): Promise<NissimPenmanRnoaResult> => {
  const { symbol, dataType, subsidiaryCompanyId } = query;
  const warnings: string[] = [];

  // year/season 沒指定時，自動抓「這家公司資產負債表跟損益表都有資料」的最新一季，見 shared/sourceData/latestQuarter.ts。
  const resolvedQuarter =
    query.year !== undefined && query.season !== undefined
      ? { year: query.year, season: query.season }
      : await getLatestAvailableQuarter(symbol, dataType, subsidiaryCompanyId, ['balanceSheet', 'incomeStatement']);
  if (!resolvedQuarter) {
    return emptyResult(symbol, dataType, subsidiaryCompanyId, [
      '查無任何一季資產負債表/損益表都有資料的季度，無法決定要用哪一季計算 Nissim & Penman RNOA。',
    ]);
  }
  const { year, season } = resolvedQuarter;
  const yearNum = Number(year);
  const seasonNum = Number(season);
  const resolvedQuery = { symbol, year, season, dataType, subsidiaryCompanyId };

  const key = { symbol: symbol, year: yearNum, quarter: seasonNum, dataType, subsidiaryCompanyId };

  // roeResult 只拿來對照重組出來的 ROE 準不準（actualRoeQuarterlyPct/actualRoeTtmPct），不是本指標
  // 自己需要查詢的欄位——跟 dupont 引用 roe/ 同一種模式，副作用是 roe/ 也會照常 upsert 自己的表。
  const [balanceSheet, currentIncomeStatement, roeResult] = await Promise.all([
    getQuarterlyBalanceSheet(key),
    getQuarterlyIncomeStatement(key),
    calculateRoe(resolvedQuery),
  ]);

  if (!balanceSheet) warnings.push('查無該季資產負債表資料。');
  if (!currentIncomeStatement) warnings.push('查無該季損益表資料。');

  const nopat = calculateNopat(currentIncomeStatement);
  if (currentIncomeStatement && nopat === null) {
    warnings.push('該季損益表營業利益、稅前淨利或所得稅費用欄位為 null，或稅前淨利為零/負數（有效稅率無意義），無法計算 NOPAT。');
  }

  // 有息負債三個欄位任一為 null 視為 0（沒有借那種負債），不是資料缺漏；只有整張資產負債表查無資料
  // 才視為缺漏——跟 deRatio/roic/netDebtToEbitda 完全相同的邏輯。
  const interestBearingDebt = balanceSheet
    ? (balanceSheet.shortTermBorrowings ?? 0n) + (balanceSheet.bondsPayable ?? 0n) + (balanceSheet.longTermBorrowings ?? 0n)
    : null;
  const cashAndEquivalents = balanceSheet?.cashAndEquivalents ?? null;
  const equity = pickEquity(balanceSheet);
  if (balanceSheet && cashAndEquivalents === null) warnings.push('該季資產負債表現金及約當現金欄位為 null，無法計算淨金融負債（NFO）。');
  if (balanceSheet && equity.value === null) warnings.push('該季資產負債表權益相關欄位皆為 null，無法計算淨營業資產（NOA）。');

  // NFO（淨金融負債） = 有息負債 - 現金及約當現金；NOA（淨營業資產） = 權益 + NFO——用「總權益 +
  // 淨金融負債」取代逐科目分類營業/融資資產負債的數學捷徑，見 guru/README.md「Nissim_Penman_RNOA
  // 卡在哪裡」的推導。
  const nfo = interestBearingDebt !== null && cashAndEquivalents !== null ? interestBearingDebt - cashAndEquivalents : null;
  const noa = nfo !== null && equity.value !== null ? equity.value + nfo : null;

  let rnoaQuarterlyPct: number | null = null;
  let rnoaQuarterlyAnnualizedPct: number | null = null;
  if (nopat !== null && noa !== null) {
    rnoaQuarterlyPct = toPct(nopat, noa);
    if (rnoaQuarterlyPct !== null) rnoaQuarterlyAnnualizedPct = round2(rnoaQuarterlyPct * 4);
    if (noa <= 0n) warnings.push('本季期末淨營業資產（NOA）為零或負數，RNOA 數值意義有限，請自行判斷是否採用。');
  }

  const flev = nfo !== null && equity.value !== null ? toRatio(nfo, equity.value) : null;
  const equityWarning = negativeEquityWarning(equity.value, 'FLEV');
  if (equityWarning) warnings.push(equityWarning);

  const afterTaxNetInterestExpenseQuarterly = calculateAfterTaxNetInterestExpense(currentIncomeStatement);
  const nbcQuarterlyPct = afterTaxNetInterestExpenseQuarterly !== null && nfo !== null ? toPct(afterTaxNetInterestExpenseQuarterly, nfo) : null;
  const spreadQuarterlyPct = rnoaQuarterlyPct !== null && nbcQuarterlyPct !== null ? round2(rnoaQuarterlyPct - nbcQuarterlyPct) : null;
  const reconstructedRoeQuarterlyPct =
    rnoaQuarterlyPct !== null && flev !== null && spreadQuarterlyPct !== null ? round2(rnoaQuarterlyPct + flev * spreadQuarterlyPct) : null;

  // TTM：近四季（含本季）NOPAT/稅後利息費用各自加總 / 本季期末 NOA、NFO（跟 roic 的 TTM 邏輯一致，
  // 分母用期末值，不是四季平均）。一季只要 NOPAT 或稅後利息費用任一算不出來就視為該季不齊。
  const ttmQuarters = getPastNQuarters({ rocYear: yearNum, season }, 4);
  const ttmIncomeRecords = await Promise.all(
    ttmQuarters.map((q) =>
      getQuarterlyIncomeStatement({
        symbol: symbol,
        year: Number(q.year),
        quarter: Number(q.season),
        dataType,
        subsidiaryCompanyId,
      })
    )
  );

  const quartersUsed: string[] = [];
  const quartersMissing: string[] = [];
  let nopatTtmSum = 0n;
  let afterTaxNetInterestExpenseTtmSum = 0n;
  let ttmComplete = true;
  ttmQuarters.forEach((q, i) => {
    const label = `${q.year}Q${q.season}`;
    const record = ttmIncomeRecords[i]!;
    if (!isQuarterComplete(record)) {
      quartersMissing.push(label);
      ttmComplete = false;
    } else {
      quartersUsed.push(label);
      nopatTtmSum += calculateNopat(record)!;
      afterTaxNetInterestExpenseTtmSum += calculateAfterTaxNetInterestExpense(record)!;
    }
  });
  if (!ttmComplete) {
    warnings.push(`近四季損益表資料不齊、稅前淨利非正、或利息費用/利息收入缺漏（缺: ${quartersMissing.join(', ')}），無法計算 TTM RNOA/NBC/SPREAD。`);
  }

  const nopatTtmValue = ttmComplete ? nopatTtmSum : null;
  const rnoaTtmPct = nopatTtmValue !== null && noa !== null ? toPct(nopatTtmValue, noa) : null;
  const afterTaxNetInterestExpenseTtmValue = ttmComplete ? afterTaxNetInterestExpenseTtmSum : null;
  const nbcTtmPct = afterTaxNetInterestExpenseTtmValue !== null && nfo !== null ? toPct(afterTaxNetInterestExpenseTtmValue, nfo) : null;
  const spreadTtmPct = rnoaTtmPct !== null && nbcTtmPct !== null ? round2(rnoaTtmPct - nbcTtmPct) : null;
  const reconstructedRoeTtmPct = rnoaTtmPct !== null && flev !== null && spreadTtmPct !== null ? round2(rnoaTtmPct + flev * spreadTtmPct) : null;

  const reportDate = balanceSheet?.reportDate ?? currentIncomeStatement?.reportDate ?? null;

  const fieldStatusEntries: Array<[string, MetricStatus] | null> = [
    nopat === null ? ['nopat', { status: 'no_data', message: '營業利益、稅前淨利或所得稅費用缺漏，或稅前淨利非正，無法計算 NOPAT。' }] : null,
    noa === null ? ['noa', { status: 'no_data', message: '淨金融負債或權益缺漏，無法計算淨營業資產（NOA）。' }] : null,
    flev === null ? ['flev', { status: 'no_data', message: '淨金融負債或權益缺漏，無法計算 FLEV。' }] : null,
    rnoaQuarterlyPct === null ? ['rnoaQuarterlyPct', { status: 'no_data', message: 'NOPAT 或 NOA 缺漏，無法計算單季 RNOA。' }] : null,
    rnoaTtmPct === null ? ['rnoaTtmPct', { status: 'no_data', message: '近四季 NOPAT 不齊或 NOA 缺漏，無法計算 TTM RNOA。' }] : null,
    reconstructedRoeQuarterlyPct === null
      ? ['reconstructedRoeQuarterlyPct', { status: 'no_data', message: 'RNOA、FLEV 或 SPREAD 任一為 null，無法組裝出單季 ROE。' }]
      : null,
    reconstructedRoeTtmPct === null
      ? ['reconstructedRoeTtmPct', { status: 'no_data', message: 'RNOA、FLEV 或 SPREAD（TTM）任一為 null，無法組裝出 TTM ROE。' }]
      : null,
  ];

  // 存進 oingg-analysis DB 的 guru_nissim_penman_rnoa，供之後查歷史紀錄用。存檔失敗不應該讓已經算好的結果回傳失敗。
  try {
    await analysisPrisma.nissimPenmanRnoaResult.upsert({
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
        rnoaQuarterlyPct,
        rnoaQuarterlyAnnualizedPct,
        rnoaTtmPct,
        flev,
        nbcQuarterlyPct,
        nbcTtmPct,
        spreadQuarterlyPct,
        spreadTtmPct,
        reconstructedRoeQuarterlyPct,
        reconstructedRoeTtmPct,
        actualRoeQuarterlyPct: roeResult.roeQuarterlyPct,
        actualRoeTtmPct: roeResult.roeTtmPct,
        nopatValue: nopat,
        nopatTtmValue,
        noaValue: noa,
        nfoValue: nfo,
        equityFieldUsed: equity.field,
        equityValue: equity.value,
        warnings,
      },
      update: {
        reportDate,
        rnoaQuarterlyPct,
        rnoaQuarterlyAnnualizedPct,
        rnoaTtmPct,
        flev,
        nbcQuarterlyPct,
        nbcTtmPct,
        spreadQuarterlyPct,
        spreadTtmPct,
        reconstructedRoeQuarterlyPct,
        reconstructedRoeTtmPct,
        actualRoeQuarterlyPct: roeResult.roeQuarterlyPct,
        actualRoeTtmPct: roeResult.roeTtmPct,
        nopatValue: nopat,
        nopatTtmValue,
        noaValue: noa,
        nfoValue: nfo,
        equityFieldUsed: equity.field,
        equityValue: equity.value,
        warnings,
      },
    });
  } catch (error) {
    logger.error({ err: error }, '[nissim-penman-rnoa]: 寫入 guru_nissim_penman_rnoa 失敗，不影響本次回傳結果。');
  }

  return {
    symbol,
    year,
    season,
    dataType,
    subsidiaryCompanyId,
    reportDate: reportDate?.toISOString().slice(0, 10) ?? null,
    rnoaQuarterlyPct,
    rnoaQuarterlyAnnualizedPct,
    rnoaTtmPct,
    flev,
    nbcQuarterlyPct,
    nbcTtmPct,
    spreadQuarterlyPct,
    spreadTtmPct,
    reconstructedRoeQuarterlyPct,
    reconstructedRoeTtmPct,
    actualRoeQuarterlyPct: roeResult.roeQuarterlyPct,
    actualRoeTtmPct: roeResult.roeTtmPct,
    nopat: { value: nopat?.toString() ?? null },
    nopatTtm: { value: nopatTtmValue?.toString() ?? null },
    noa: { value: noa?.toString() ?? null },
    nfo: { value: nfo?.toString() ?? null },
    equity: { fieldUsed: equity.field, value: equity.value?.toString() ?? null },
    ttm: { quartersUsed, quartersMissing },
    fieldStatuses: buildFieldStatuses(fieldStatusEntries),
    warnings,
  };
};
