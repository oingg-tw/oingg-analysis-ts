import { analysisPrisma } from '@/adapters/prisma/analysisClient';
import { getPastNQuarters, type Season } from '@/shared/rocQuarter';
import { getLatestAvailableQuarter } from '@/shared/sourceData/latestQuarter';
import { getQuarterlyBalanceSheet, getQuarterlyCashFlowStatement, getQuarterlyIncomeStatement } from '@/shared/sourceData/mopsQuarterlyStatements';
import type { MetricResultMeta } from '@/shared/metricStatus';
import type { QuarterlyMetricQuery, QuarterlyMetricIdentity } from '@/shared/quarterlyMetric';
import { logger } from '@/shared/logger';

// year/season 選填但要成對——不給就自動抓「這家公司資產負債表/損益表/現金流量表都有資料」的
// 最新一季（見 shared/sourceData/latestQuarter.ts），只給其中一個視為無效請求（在 controller 用 zod refine 擋掉）。
// 這裡的自動解析只決定「本季」，YoY 比較用的「去年同季」邏輯不受影響，照常用 getPastNQuarters 往前推。
export type BeneishMScoreQuery = QuarterlyMetricQuery;

export interface BeneishMScoreResult extends QuarterlyMetricIdentity, MetricResultMeta {
  // M = -4.84 + 0.920*DSRI + 0.528*GMI + 0.404*AQI + 0.892*SGI + 0.115*DEPI
  //     - 0.172*SGAI + 4.037*TATA + 0.0327*LVGI
  // 8 個變量任一為 null，mScore 就是 null。
  mScore: number | null;
  // M-Score > -1.78：財務造假/營收灌水風險較高；M-Score <= -1.78：財務數據可信度較高
  // （這是原始論文的判別門檻，不是本服務自訂的）。
  flagged: boolean | null;

  dsri: number | null; // 應收帳款指數
  gmi: number | null; // 毛利率指數
  aqi: number | null; // 資產品質指數（簡化版，沒有扣除有價證券，只扣流動資產+PPE）
  sgi: number | null; // 營收成長指數
  depi: number | null; // 折舊指數（只用 depreciation，不含 amortization）
  sgai: number | null; // 管銷費用指數（SGA = 推銷費用 + 管理費用）
  tata: number | null; // 總應計利潤對總資產比（不需要跟去年比較，單期指標）
  lvgi: number | null; // 槓桿指數（簡化版，用總負債/總資產，不是長期負債+流動負債的嚴格定義）

  // 拿來跟本季比較的「去年同季」，用 getPastNQuarters 往前推 4 季定位。
  priorYear: string | null;
  priorSeason: Season | null;
  priorReportDate: string | null;
}

// 淨利欄位選擇邏輯跟 ROE/EPS 一致：優先採用「歸屬於母公司」口徑，缺漏時退回用整體數字。
const pickNetIncome = (
  record: { netIncomeAttributableToParent: bigint | null; netIncome: bigint | null } | null
): bigint | null => {
  if (!record) return null;
  if (record.netIncomeAttributableToParent !== null) return record.netIncomeAttributableToParent;
  return record.netIncome;
};

interface QuarterData {
  accountsReceivable: bigint | null;
  operatingRevenue: bigint | null;
  grossProfit: bigint | null;
  currentAssets: bigint | null;
  propertyPlantEquipment: bigint | null;
  totalAssets: bigint | null;
  totalLiabilities: bigint | null;
  depreciation: bigint | null;
  sellingExpenses: bigint | null;
  adminExpenses: bigint | null;
  netIncome: bigint | null;
  operatingCashFlow: bigint | null;
  reportDate: Date | null;
}

const fetchQuarterData = async (
  symbol: string,
  year: string,
  season: Season,
  dataType: string,
  subsidiaryCompanyId: string
): Promise<QuarterData> => {
  const key = {
    symbol: symbol,
    year: Number(year),
    quarter: Number(season),
    dataType,
    subsidiaryCompanyId,
  };

  const [balanceSheet, incomeStatement, cashFlow] = await Promise.all([
    getQuarterlyBalanceSheet(key),
    getQuarterlyIncomeStatement(key),
    getQuarterlyCashFlowStatement(key),
  ]);

  return {
    accountsReceivable: balanceSheet?.accountsReceivable ?? null,
    operatingRevenue: incomeStatement?.operatingRevenue ?? null,
    grossProfit: incomeStatement?.grossProfit ?? null,
    currentAssets: balanceSheet?.currentAssets ?? null,
    propertyPlantEquipment: balanceSheet?.propertyPlantEquipment ?? null,
    totalAssets: balanceSheet?.totalAssets ?? null,
    totalLiabilities: balanceSheet?.totalLiabilities ?? null,
    depreciation: cashFlow?.depreciation ?? null,
    sellingExpenses: incomeStatement?.sellingExpenses ?? null,
    adminExpenses: incomeStatement?.adminExpenses ?? null,
    netIncome: pickNetIncome(incomeStatement),
    operatingCashFlow: cashFlow?.netCashFromOperatingActivities ?? null,
    reportDate: balanceSheet?.reportDate ?? incomeStatement?.reportDate ?? cashFlow?.reportDate ?? null,
  };
};

// 兩個 bigint 相除，任一為 null 或分母為 0 回傳 null。
const safeRatio = (num: bigint | null, den: bigint | null): number | null => {
  if (num === null || den === null || den === 0n) return null;
  return Number(num) / Number(den);
};

// 兩個已經算好的比率再相除（本季比率 / 去年同季比率，或反過來，依變量定義而定）。
const indexOf = (a: number | null, b: number | null): number | null => {
  if (a === null || b === null || b === 0) return null;
  return a / b;
};

const round4 = (x: number | null): number | null => (x === null ? null : Math.round(x * 10000) / 10000);

const emptyResult = (symbol: string, dataType: '1' | '2', subsidiaryCompanyId: string, warnings: string[]): BeneishMScoreResult => ({
  symbol,
  year: null,
  season: null,
  dataType,
  subsidiaryCompanyId,
  reportDate: null,
  mScore: null,
  flagged: null,
  dsri: null,
  gmi: null,
  aqi: null,
  sgi: null,
  depi: null,
  sgai: null,
  tata: null,
  lvgi: null,
  priorYear: null,
  priorSeason: null,
  priorReportDate: null,
  warnings,
});

export const calculateBeneishMScore = async (query: BeneishMScoreQuery): Promise<BeneishMScoreResult> => {
  const { symbol, dataType, subsidiaryCompanyId } = query;
  const warnings: string[] = [];

  // year/season 沒指定時，自動抓「這家公司資產負債表/損益表/現金流量表都有資料」的最新一季——
  // 只決定「本季」，YoY 比較用的「去年同季」邏輯不受影響，照常用 getPastNQuarters 往前推。
  // 不同公司財報申報進度不同步（實測驗證過：2887 損益表曾經卡在比資產負債表舊 3 季），見 shared/sourceData/latestQuarter.ts。
  const resolvedQuarter =
    query.year !== undefined && query.season !== undefined
      ? { year: query.year, season: query.season }
      : await getLatestAvailableQuarter(symbol, dataType, subsidiaryCompanyId, ['balanceSheet', 'incomeStatement', 'cashFlowStatement']);
  if (!resolvedQuarter) {
    return emptyResult(symbol, dataType, subsidiaryCompanyId, [
      '查無任何一季資產負債表/損益表/現金流量表都有資料的季度，無法決定要用哪一季計算 Beneish M-Score。',
    ]);
  }
  const { year, season } = resolvedQuarter;

  const fiveQuartersBack = getPastNQuarters({ rocYear: Number(year), season }, 5);
  const prior = fiveQuartersBack[0]!;

  const [curr, prev] = await Promise.all([
    fetchQuarterData(symbol, year, season, dataType, subsidiaryCompanyId),
    fetchQuarterData(symbol, prior.year, prior.season, dataType, subsidiaryCompanyId),
  ]);

  if (!curr.reportDate) warnings.push(`查無 ${year}Q${season} 的財報資料（資產負債表/損益表/現金流量表皆查無）。`);
  if (!prev.reportDate) warnings.push(`查無去年同季 ${prior.year}Q${prior.season} 的財報資料，8 個變量都無法計算。`);

  // DSRI（應收帳款指數）= (應收帳款/營收)本季 / (應收帳款/營收)去年同季。
  const dsri = round4(indexOf(safeRatio(curr.accountsReceivable, curr.operatingRevenue), safeRatio(prev.accountsReceivable, prev.operatingRevenue)));

  // GMI（毛利率指數）= 去年同季毛利率 / 本季毛利率——注意分子分母是「去年/今年」，跟其他變量方向相反，
  // 因為 GMI > 1 代表毛利率惡化（去年比較高），毛利率惡化是造假動機的訊號。
  const gmi = round4(indexOf(safeRatio(prev.grossProfit, prev.operatingRevenue), safeRatio(curr.grossProfit, curr.operatingRevenue)));

  // AQI（資產品質指數）= [1 - (流動資產+PPE)/總資產]本季 / [1 - (流動資產+PPE)/總資產]去年同季。
  // 簡化版：原始定義還要扣有價證券，財報沒有單獨的「有價證券」欄位，這裡只扣流動資產+PPE。
  const currNonEarningAssetRatio =
    curr.currentAssets !== null && curr.propertyPlantEquipment !== null && curr.totalAssets !== null && curr.totalAssets !== 0n
      ? 1 - Number(curr.currentAssets + curr.propertyPlantEquipment) / Number(curr.totalAssets)
      : null;
  const prevNonEarningAssetRatio =
    prev.currentAssets !== null && prev.propertyPlantEquipment !== null && prev.totalAssets !== null && prev.totalAssets !== 0n
      ? 1 - Number(prev.currentAssets + prev.propertyPlantEquipment) / Number(prev.totalAssets)
      : null;
  const aqi = round4(indexOf(currNonEarningAssetRatio, prevNonEarningAssetRatio));

  // SGI（營收成長指數）= 本季營收 / 去年同季營收，是唯一「直接比」不是「比率再比」的變量。
  const sgi = round4(safeRatio(curr.operatingRevenue, prev.operatingRevenue));

  // DEPI（折舊指數）= (折舊/(折舊+PPE))去年同季 / (折舊/(折舊+PPE))本季——分子分母跟 GMI 一樣方向相反，
  // DEPI > 1 代表折舊率下降（今年比較低），可能是拉長折舊年限美化財報的訊號。
  // 只用 depreciation（不含 amortization），對應原始定義的「固定資產折舊率」，不是無形資產攤銷。
  const currDepRate =
    curr.depreciation !== null && curr.propertyPlantEquipment !== null && curr.depreciation + curr.propertyPlantEquipment !== 0n
      ? Number(curr.depreciation) / Number(curr.depreciation + curr.propertyPlantEquipment)
      : null;
  const prevDepRate =
    prev.depreciation !== null && prev.propertyPlantEquipment !== null && prev.depreciation + prev.propertyPlantEquipment !== 0n
      ? Number(prev.depreciation) / Number(prev.depreciation + prev.propertyPlantEquipment)
      : null;
  const depi = round4(indexOf(prevDepRate, currDepRate));

  // SGAI（管銷費用指數）= (SGA/營收)本季 / (SGA/營收)去年同季。SGA = 推銷費用 + 管理費用
  // （財報是分開的兩個欄位，這裡加總成傳統定義的 SG&A）。
  const currSga = curr.sellingExpenses !== null && curr.adminExpenses !== null ? curr.sellingExpenses + curr.adminExpenses : null;
  const prevSga = prev.sellingExpenses !== null && prev.adminExpenses !== null ? prev.sellingExpenses + prev.adminExpenses : null;
  const sgai = round4(indexOf(safeRatio(currSga, curr.operatingRevenue), safeRatio(prevSga, prev.operatingRevenue)));

  // TATA（總應計利潤對總資產比）= (本季淨利 - 本季 CFO) / 本季總資產。只看本季，不跟去年同季比較。
  const tata =
    curr.netIncome !== null && curr.operatingCashFlow !== null
      ? round4(safeRatio(curr.netIncome - curr.operatingCashFlow, curr.totalAssets))
      : null;

  // LVGI（槓桿指數）= (總負債/總資產)本季 / (總負債/總資產)去年同季。簡化版：原始定義是「長期負債+流動負債」，
  // 這裡直接用總負債（等於兩者加總），跟 debtRatio/ 的分子口徑一致。
  const lvgi = round4(indexOf(safeRatio(curr.totalLiabilities, curr.totalAssets), safeRatio(prev.totalLiabilities, prev.totalAssets)));

  let mScore: number | null = null;
  if (dsri !== null && gmi !== null && aqi !== null && sgi !== null && depi !== null && sgai !== null && tata !== null && lvgi !== null) {
    mScore =
      Math.round(
        (-4.84 + 0.92 * dsri + 0.528 * gmi + 0.404 * aqi + 0.892 * sgi + 0.115 * depi - 0.172 * sgai + 4.037 * tata + 0.0327 * lvgi) * 10000
      ) / 10000;
  }

  const flagged = mScore === null ? null : mScore > -1.78;

  // 存進 oingg-analysis DB 的 guru_beneish_m_score，供之後查歷史紀錄用。存檔失敗不應該讓已經算好的結果回傳失敗。
  try {
    await analysisPrisma.beneishMScoreResult.upsert({
      where: {
        symbol_year_season_dataType_subsidiaryCompanyId: {
          symbol: symbol,
          year: Number(year),
          season: Number(season),
          dataType,
          subsidiaryCompanyId,
        },
      },
      create: {
        symbol: symbol,
        year: Number(year),
        season: Number(season),
        dataType,
        subsidiaryCompanyId,
        reportDate: curr.reportDate,
        mScore,
        dsri,
        gmi,
        aqi,
        sgi,
        depi,
        sgai,
        tata,
        lvgi,
        priorYear: Number(prior.year),
        priorSeason: Number(prior.season),
        priorReportDate: prev.reportDate,
        warnings,
      },
      update: {
        reportDate: curr.reportDate,
        mScore,
        dsri,
        gmi,
        aqi,
        sgi,
        depi,
        sgai,
        tata,
        lvgi,
        priorYear: Number(prior.year),
        priorSeason: Number(prior.season),
        priorReportDate: prev.reportDate,
        warnings,
      },
    });
  } catch (error) {
    logger.error({ err: error }, '[beneish-m-score]: 寫入 guru_beneish_m_score 失敗，不影響本次回傳結果。');
  }

  return {
    symbol,
    year,
    season,
    dataType,
    subsidiaryCompanyId,
    reportDate: curr.reportDate ? curr.reportDate.toISOString().slice(0, 10) : null,
    mScore,
    flagged,
    dsri,
    gmi,
    aqi,
    sgi,
    depi,
    sgai,
    tata,
    lvgi,
    priorYear: prior.year,
    priorSeason: prior.season,
    priorReportDate: prev.reportDate ? prev.reportDate.toISOString().slice(0, 10) : null,
    warnings,
  };
};
