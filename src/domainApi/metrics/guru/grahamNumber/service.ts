import { analysisPrisma } from '@/adapters/prisma/analysisClient';
import { calculateEps } from '@/domainApi/metrics/profitability/eps/service';
import { calculateBvps } from '@/domainApi/metrics/profitability/bvps/service';
import { getLatestAvailableQuarter } from '@/shared/sourceData/latestQuarter';
import type { GrahamNumberQuery, GrahamNumberResult } from './types';

const emptyResult = (companyId: string, dataType: '1' | '2', subsidiaryCompanyId: string, warnings: string[]): GrahamNumberResult => ({
  companyId,
  year: null,
  season: null,
  dataType,
  subsidiaryCompanyId,
  reportDate: null,
  grahamNumber: null,
  epsTtm: { value: null },
  bvps: { value: null },
  warnings,
});

export const calculateGrahamNumber = async (query: GrahamNumberQuery): Promise<GrahamNumberResult> => {
  const { companyId, dataType, subsidiaryCompanyId } = query;
  const warnings: string[] = [];

  // year/season 沒指定時，自動抓「這家公司資產負債表跟損益表都有資料」的最新一季——eps/bvps 兩個
  // 組成指標各自需要的表的聯集。不同公司財報申報進度不同步（實測驗證過：2887 損益表曾經卡在比
  // 資產負債表舊 3 季），見 shared/sourceData/latestQuarter.ts。解析出來的具體季度原樣往下傳給 eps/bvps，
  // 不讓它們各自再解析一次——避免兩個組成指標各自解析出不同季度（跟 altmanZScore 引用
  // interestCoverage/turnoverRatio 同一種模式）。
  const resolvedQuarter =
    query.year !== undefined && query.season !== undefined
      ? { year: query.year, season: query.season }
      : await getLatestAvailableQuarter(companyId, dataType, subsidiaryCompanyId, ['balanceSheet', 'incomeStatement']);
  if (!resolvedQuarter) {
    return emptyResult(companyId, dataType, subsidiaryCompanyId, ['查無任何一季資產負債表/損益表都有資料的季度，無法決定要用哪一季計算葛拉漢數。']);
  }
  const { year, season } = resolvedQuarter;
  const yearNum = Number(year);
  const seasonNum = Number(season);
  const composedQuery = { companyId, year, season, dataType, subsidiaryCompanyId };

  // 直接引用已經做好的 eps/、bvps/ 服務，不重複實作淨利/權益口徑選擇、流通股數查詢那些邏輯——
  // 副作用是這兩支服務各自也會 upsert 自己的 profitability_eps/profitability_bvps，這是預期行為，不是意外。
  const [epsResult, bvpsResult] = await Promise.all([calculateEps(composedQuery), calculateBvps(composedQuery)]);

  const epsTtm = epsResult.epsTtm;
  const bvps = bvpsResult.bvps;

  if (epsTtm === null) warnings.push('TTM EPS 無法取得，無法計算葛拉漢數（詳見 eps 服務的 warnings）。');
  if (bvps === null) warnings.push('BVPS 無法取得，無法計算葛拉漢數（詳見 bvps 服務的 warnings）。');

  let grahamNumber: number | null = null;
  if (epsTtm !== null && bvps !== null) {
    if (epsTtm <= 0 || bvps <= 0) {
      warnings.push('TTM EPS 或 BVPS 為零或負值，葛拉漢數公式假設兩者皆為正值（公司要有正的獲利跟正的淨值），無法計算。');
    } else {
      grahamNumber = Math.round(Math.sqrt(22.5 * epsTtm * bvps) * 100) / 100;
    }
  }

  const reportDate = bvpsResult.reportDate ?? epsResult.reportDate ?? null;

  // 存進 oingg-analysis DB 的 guru_graham_number，供之後查歷史紀錄用。存檔失敗不應該讓已經算好的結果回傳失敗。
  try {
    await analysisPrisma.grahamNumberResult.upsert({
      where: {
        symbol_year_season_dataType_subsidiaryCompanyId: { symbol: companyId, year: yearNum, season: seasonNum, dataType, subsidiaryCompanyId },
      },
      create: {
        symbol: companyId,
        year: yearNum,
        season: seasonNum,
        dataType,
        subsidiaryCompanyId,
        reportDate: reportDate ? new Date(`${reportDate}T00:00:00.000Z`) : null,
        grahamNumber,
        epsTtmValue: epsTtm,
        bvpsValue: bvps,
        warnings,
      },
      update: {
        reportDate: reportDate ? new Date(`${reportDate}T00:00:00.000Z`) : null,
        grahamNumber,
        epsTtmValue: epsTtm,
        bvpsValue: bvps,
        warnings,
      },
    });
  } catch (error) {
    console.error('[graham-number]: 寫入 guru_graham_number 失敗，不影響本次回傳結果。', error);
  }

  return {
    companyId,
    year,
    season,
    dataType,
    subsidiaryCompanyId,
    reportDate,
    grahamNumber,
    epsTtm: { value: epsTtm },
    bvps: { value: bvps },
    warnings,
  };
};
