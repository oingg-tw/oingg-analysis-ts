import { analysisPrisma } from '@/adapters/prisma/analysisClient';
import { calculateEps } from '@/domains/profitability/eps/service';
import { calculateBvps } from '@/domains/profitability/bvps/service';
import type { GrahamNumberQuery, GrahamNumberResult } from './types';

export const calculateGrahamNumber = async (query: GrahamNumberQuery): Promise<GrahamNumberResult> => {
  const { companyId, year, season, dataType, subsidiaryCompanyId } = query;
  const yearNum = Number(year);
  const seasonNum = Number(season);
  const warnings: string[] = [];

  // 直接引用已經做好的 eps/、bvps/ 服務，不重複實作淨利/權益口徑選擇、流通股數查詢那些邏輯——
  // 副作用是這兩支服務各自也會 upsert 自己的 profitability_eps/profitability_bvps，這是預期行為，不是意外。
  const [epsResult, bvpsResult] = await Promise.all([calculateEps(query), calculateBvps(query)]);

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
