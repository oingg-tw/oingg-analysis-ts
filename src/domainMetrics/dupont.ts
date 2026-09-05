import { analysisPrisma } from '@/adapters/prisma/analysisClient';
import { calculateMargins } from '@/domainMetrics/margins';
import { calculateTurnoverRatio } from '@/domainMetrics/turnoverRatio';
import { calculateRoe } from '@/domainMetrics/roe';
import type { MetricResultMeta } from '@/shared/metricStatus';
import { negativeEquityWarning } from '@/shared/negativeEquityGuard';
import { getLatestAvailableQuarter } from '@/shared/sourceData/latestQuarter';
import type { QuarterlyMetricQuery, QuarterlyMetricIdentity } from '@/shared/quarterlyMetric';
import { logger } from '@/shared/logger';

// year/season 選填但要成對——不給就自動抓「這家公司資產負債表跟損益表都有資料」的最新一季
// （見 shared/sourceData/latestQuarter.ts），只給其中一個視為無效請求（在 controller 用 zod refine 擋掉）。
// 解析出來的季度會以固定值傳給 margins/turnoverRatio/roe 三支底層服務，不會讓它們各自再重複解析一次。
export type DupontQuery = QuarterlyMetricQuery;

export interface DupontResult extends QuarterlyMetricIdentity, MetricResultMeta {
  // 3 步杜邦分析：ROE = 淨利率 x 總資產週轉率 x 權益乘數。
  // 淨利率、總資產週轉率直接引用 margins/、turnoverRatio/ 已經算好的值，不重複查詢。
  netProfitMarginQuarterly: number | null; // %，引用自 margins/ 的 netProfitMarginQuarterly
  netProfitMarginTtm: number | null; // %，引用自 margins/ 的 netProfitMarginTtm
  assetTurnoverQuarterly: number | null; // 次，引用自 turnoverRatio/ 的 assetTurnoverQuarterly
  assetTurnoverTtm: number | null; // 次，引用自 turnoverRatio/ 的 assetTurnoverTtm
  // 權益乘數 = 總資產 / 權益，純資產負債表時點快照，單季/TTM 共用同一個值
  // （跟 ROE 用期末權益、不分單季/TTM 的道理一樣）。
  equityMultiplier: number | null;

  // 用上面三個因子重新相乘組裝出來的 ROE，理論上應該等於（或極接近）roe/ 直接算出來的值——
  // 兩者對照著看，可以互相驗證杜邦拆解跟 ROE 計算邏輯有沒有一致，小數點誤差是四捨五入造成的正常現象。
  decomposedRoeQuarterlyPct: number | null;
  decomposedRoeTtmPct: number | null;
  actualRoeQuarterlyPct: number | null; // 引用自 roe/ 的 roeQuarterlyPct，供對照
  actualRoeTtmPct: number | null; // 引用自 roe/ 的 roeTtmPct，供對照

  totalAssets: {
    value: string | null; // BigInt as string；本季期末總資產
  };
  equity: {
    fieldUsed: 'equityAttributableToParent' | 'totalEquity' | null;
    value: string | null; // BigInt as string；本季期末權益
  };
}

const round2 = (x: number): number => Math.round(x * 100) / 100;

const emptyResult = (symbol: string, dataType: '1' | '2', subsidiaryCompanyId: string, warnings: string[]): DupontResult => ({
  symbol,
  year: null,
  season: null,
  dataType,
  subsidiaryCompanyId,
  reportDate: null,
  netProfitMarginQuarterly: null,
  netProfitMarginTtm: null,
  assetTurnoverQuarterly: null,
  assetTurnoverTtm: null,
  equityMultiplier: null,
  decomposedRoeQuarterlyPct: null,
  decomposedRoeTtmPct: null,
  actualRoeQuarterlyPct: null,
  actualRoeTtmPct: null,
  totalAssets: { value: null },
  equity: { fieldUsed: null, value: null },
  warnings,
});

export const calculateDupont = async (query: DupontQuery): Promise<DupontResult> => {
  const { symbol, dataType, subsidiaryCompanyId } = query;
  const warnings: string[] = [];

  // year/season 沒指定時，自動抓「這家公司資產負債表跟損益表都有資料」的最新一季——margins
  // （['incomeStatement']）、turnoverRatio、roe（['balanceSheet','incomeStatement']）三支底層服務
  // 需要的表的聯集就是 ['balanceSheet','incomeStatement']，見 shared/sourceData/latestQuarter.ts。
  const resolvedQuarter =
    query.year !== undefined && query.season !== undefined
      ? { year: query.year, season: query.season }
      : await getLatestAvailableQuarter(symbol, dataType, subsidiaryCompanyId, ['balanceSheet', 'incomeStatement']);
  if (!resolvedQuarter) {
    return emptyResult(symbol, dataType, subsidiaryCompanyId, ['查無任何一季資產負債表/損益表都有資料的季度，無法決定要用哪一季計算杜邦分析。']);
  }
  const { year, season } = resolvedQuarter;

  // 把解析出來的固定季度傳給 margins/turnoverRatio/roe，三支底層服務都收到已經確定的 year/season，
  // 不會各自再重複解析一次（也不會各自解析出不同季度）。
  const resolvedQuery = { symbol, year, season, dataType, subsidiaryCompanyId };

  // 3 步杜邦分析的三個因子分別引用已經做好的 margins/、turnoverRatio/、roe/ 服務，不重複實作
  // 損益表/資產負債表查詢邏輯——跟 grahamNumber 引用 eps/bvps 同一種模式。副作用是這三支服務
  // 也會各自照常把自己的結果 upsert 進 profitability_margins/turnover_ratio/profitability_roe，
  // 這是預期行為，不是意外。
  const [marginsResult, turnoverRatioResult, roeResult] = await Promise.all([
    calculateMargins(resolvedQuery),
    calculateTurnoverRatio(resolvedQuery),
    calculateRoe(resolvedQuery),
  ]);

  const netProfitMarginQuarterly = marginsResult.netProfitMarginQuarterly;
  const netProfitMarginTtm = marginsResult.netProfitMarginTtm;
  const assetTurnoverQuarterly = turnoverRatioResult.assetTurnoverQuarterly;
  const assetTurnoverTtm = turnoverRatioResult.assetTurnoverTtm;

  if (netProfitMarginQuarterly === null) warnings.push('淨利率無法取得（詳見 margins 服務的 warnings），無法計算杜邦拆解。');
  if (assetTurnoverQuarterly === null) warnings.push('總資產週轉率無法取得（詳見 turnoverRatio 服務的 warnings），無法計算杜邦拆解。');

  const totalAssetsValue = turnoverRatioResult.totalAssets.value; // BigInt as string，來自 turnoverRatio/ 已經查過的資產負債表
  const equity = roeResult.equity; // { fieldUsed, value }，來自 roe/ 已經查過的資產負債表

  let equityMultiplier: number | null = null;
  if (totalAssetsValue !== null && equity.value !== null) {
    const equityBigInt = BigInt(equity.value);
    if (equityBigInt !== 0n) {
      equityMultiplier = round2(Number(BigInt(totalAssetsValue)) / Number(equityBigInt));
      // 權益為負時 equityMultiplier 本身是負數——decomposedRoe = 淨利率 x 週轉率 x 權益乘數，
      // 虧損公司（淨利率也是負）會被兩個負數相乘抵消掉符號，算出看似正常的正值 ROE，
      // 跟 roe/deRatio/nissimPenmanRnoa 三支指標的除法版本是同一種失真，只是透過乘法路徑，
      // 2026-09-04 之前這裡漏了這個警告，只擋了「權益剛好等於零」的除以零錯誤。
      const equityWarning = negativeEquityWarning(equityBigInt, '權益乘數與組裝 ROE');
      if (equityWarning) warnings.push(equityWarning);
    } else {
      warnings.push('本季期末權益為零，無法計算權益乘數。');
    }
  } else {
    warnings.push('總資產或權益缺漏（詳見 turnoverRatio/roe 服務的 warnings），無法計算權益乘數。');
  }

  const decomposedRoeQuarterlyPct =
    netProfitMarginQuarterly !== null && assetTurnoverQuarterly !== null && equityMultiplier !== null
      ? round2(netProfitMarginQuarterly * assetTurnoverQuarterly * equityMultiplier)
      : null;
  const decomposedRoeTtmPct =
    netProfitMarginTtm !== null && assetTurnoverTtm !== null && equityMultiplier !== null
      ? round2(netProfitMarginTtm * assetTurnoverTtm * equityMultiplier)
      : null;

  // margins/turnoverRatio/roe 回傳的 reportDate 已經是 "YYYY-MM-DD" 字串（給 API response 用），
  // 寫回 DB 的 @db.Date 欄位需要 Date 物件，兩者分開處理。
  const reportDate = marginsResult.reportDate ?? turnoverRatioResult.reportDate ?? roeResult.reportDate ?? null;
  const reportDateForDb = reportDate ? new Date(reportDate) : null;


  // 存進 oingg-analysis DB 的 profitability_dupont，供之後查歷史紀錄用。存檔失敗不應該讓已經算好的結果回傳失敗。
  try {
    await analysisPrisma.dupontResult.upsert({
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
        reportDate: reportDateForDb,
        netProfitMarginQuarterly,
        netProfitMarginTtm,
        assetTurnoverQuarterly,
        assetTurnoverTtm,
        equityMultiplier,
        decomposedRoeQuarterlyPct,
        decomposedRoeTtmPct,
        actualRoeQuarterlyPct: roeResult.roeQuarterlyPct,
        actualRoeTtmPct: roeResult.roeTtmPct,
        totalAssetsValue: totalAssetsValue !== null ? BigInt(totalAssetsValue) : null,
        equityFieldUsed: equity.fieldUsed,
        equityValue: equity.value !== null ? BigInt(equity.value) : null,
        warnings,
      },
      update: {
        reportDate: reportDateForDb,
        netProfitMarginQuarterly,
        netProfitMarginTtm,
        assetTurnoverQuarterly,
        assetTurnoverTtm,
        equityMultiplier,
        decomposedRoeQuarterlyPct,
        decomposedRoeTtmPct,
        actualRoeQuarterlyPct: roeResult.roeQuarterlyPct,
        actualRoeTtmPct: roeResult.roeTtmPct,
        totalAssetsValue: totalAssetsValue !== null ? BigInt(totalAssetsValue) : null,
        equityFieldUsed: equity.fieldUsed,
        equityValue: equity.value !== null ? BigInt(equity.value) : null,
        warnings,
      },
    });
  } catch (error) {
    logger.error({ err: error }, '[dupont]: 寫入 profitability_dupont 失敗，不影響本次回傳結果。');
  }

  return {
    symbol,
    year,
    season,
    dataType,
    subsidiaryCompanyId,
    reportDate,
    netProfitMarginQuarterly,
    netProfitMarginTtm,
    assetTurnoverQuarterly,
    assetTurnoverTtm,
    equityMultiplier,
    decomposedRoeQuarterlyPct,
    decomposedRoeTtmPct,
    actualRoeQuarterlyPct: roeResult.roeQuarterlyPct,
    actualRoeTtmPct: roeResult.roeTtmPct,
    totalAssets: { value: totalAssetsValue },
    equity,
    warnings,
  };
};
