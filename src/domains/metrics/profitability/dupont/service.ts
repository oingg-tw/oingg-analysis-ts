import { analysisPrisma } from '@/adapters/prisma/analysisClient';
import { calculateMargins } from '@/domains/metrics/profitability/margins/service';
import { calculateTurnoverRatio } from '@/domains/metrics/turnover/turnoverRatio/service';
import { calculateRoe } from '@/domains/metrics/profitability/roe/service';
import { buildFieldStatuses, type MetricStatus } from '@/shared/metricStatus';
import { getLatestAvailableQuarter } from '@/shared/sourceData/latestQuarter';
import type { DupontQuery, DupontResult } from './types';

const round2 = (x: number): number => Math.round(x * 100) / 100;

const emptyResult = (companyId: string, dataType: '1' | '2', subsidiaryCompanyId: string, warnings: string[]): DupontResult => ({
  companyId,
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
  fieldStatuses: {},
  warnings,
});

export const calculateDupont = async (query: DupontQuery): Promise<DupontResult> => {
  const { companyId, dataType, subsidiaryCompanyId } = query;
  const warnings: string[] = [];

  // year/season 沒指定時，自動抓「這家公司資產負債表跟損益表都有資料」的最新一季——margins
  // （['incomeStatement']）、turnoverRatio、roe（['balanceSheet','incomeStatement']）三支底層服務
  // 需要的表的聯集就是 ['balanceSheet','incomeStatement']，見 shared/sourceData/latestQuarter.ts。
  const resolvedQuarter =
    query.year !== undefined && query.season !== undefined
      ? { year: query.year, season: query.season }
      : await getLatestAvailableQuarter(companyId, dataType, subsidiaryCompanyId, ['balanceSheet', 'incomeStatement']);
  if (!resolvedQuarter) {
    return emptyResult(companyId, dataType, subsidiaryCompanyId, ['查無任何一季資產負債表/損益表都有資料的季度，無法決定要用哪一季計算杜邦分析。']);
  }
  const { year, season } = resolvedQuarter;

  // 把解析出來的固定季度傳給 margins/turnoverRatio/roe，三支底層服務都收到已經確定的 year/season，
  // 不會各自再重複解析一次（也不會各自解析出不同季度）。
  const resolvedQuery = { companyId, year, season, dataType, subsidiaryCompanyId };

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

  const fieldStatusEntries: Array<[string, MetricStatus] | null> = [
    netProfitMarginQuarterly === null && netProfitMarginTtm === null
      ? ['netProfitMargin', { status: 'no_data', message: '淨利率無法取得，詳見 margins 服務的 warnings。' }]
      : null,
    assetTurnoverQuarterly === null && assetTurnoverTtm === null
      ? ['assetTurnover', { status: 'no_data', message: '總資產週轉率無法取得，詳見 turnoverRatio 服務的 warnings。' }]
      : null,
    equityMultiplier === null ? ['equityMultiplier', { status: 'no_data', message: '總資產或權益缺漏，無法計算權益乘數。' }] : null,
    decomposedRoeQuarterlyPct === null
      ? ['decomposedRoeQuarterlyPct', { status: 'no_data', message: '淨利率、總資產週轉率或權益乘數任一為 null，無法組裝出單季 ROE。' }]
      : null,
    decomposedRoeTtmPct === null
      ? ['decomposedRoeTtmPct', { status: 'no_data', message: '淨利率(TTM)、總資產週轉率(TTM)或權益乘數任一為 null，無法組裝出 TTM ROE。' }]
      : null,
  ];

  // 存進 oingg-analysis DB 的 profitability_dupont，供之後查歷史紀錄用。存檔失敗不應該讓已經算好的結果回傳失敗。
  try {
    await analysisPrisma.dupontResult.upsert({
      where: {
        symbol_year_season_dataType_subsidiaryCompanyId: {
          symbol: companyId,
          year: Number(year),
          season: Number(season),
          dataType,
          subsidiaryCompanyId,
        },
      },
      create: {
        symbol: companyId,
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
    console.error('[dupont]: 寫入 profitability_dupont 失敗，不影響本次回傳結果。', error);
  }

  return {
    companyId,
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
    fieldStatuses: buildFieldStatuses(fieldStatusEntries),
    warnings,
  };
};
