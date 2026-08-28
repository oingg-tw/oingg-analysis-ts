import { analysisPrisma } from '@/adapters/prisma/analysisClient';
import { calculateRoe } from '@/domains/profitability/roe/service';
import { calculateDividendPayoutRatio } from '@/domains/profitability/dividendPayoutRatio/service';
import type { SgrQuery, SgrResult } from './types';

export const calculateSgr = async (query: SgrQuery): Promise<SgrResult> => {
  const { companyId, year, season, dataType, subsidiaryCompanyId } = query;
  const yearNum = Number(year);
  const seasonNum = Number(season);
  const warnings: string[] = [];

  // 直接引用已經做好的 roe/、dividendPayoutRatio/ 服務，不重複實作查詢邏輯——
  // 副作用是這兩支服務各自也會 upsert 自己的 profitability_roe/profitability_dividend_payout_ratio，
  // 這是預期行為，不是意外（跟 grahamNumber 引用 eps/bvps 同一種模式）。
  const [roeResult, payoutRatioResult] = await Promise.all([calculateRoe(query), calculateDividendPayoutRatio(query)]);

  const roeTtm = roeResult.roeTtmPct;
  const payoutRatioTtm = payoutRatioResult.payoutRatioTtm;

  if (roeTtm === null) warnings.push('TTM ROE 無法取得，無法計算 SGR（詳見 roe 服務的 warnings）。');
  if (payoutRatioTtm === null) warnings.push('TTM 配息率無法取得，無法計算 SGR（詳見 dividendPayoutRatio 服務的 warnings）。');

  let sgrTtm: number | null = null;
  if (roeTtm !== null && payoutRatioTtm !== null) {
    sgrTtm = Math.round(roeTtm * (1 - payoutRatioTtm / 100) * 100) / 100;
  }

  const reportDate = roeResult.reportDate ?? payoutRatioResult.reportDate ?? null;

  // 存進 oingg-analysis DB 的 profitability_sgr，供之後查歷史紀錄用。存檔失敗不應該讓已經算好的結果回傳失敗。
  try {
    await analysisPrisma.sgrResult.upsert({
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
        sgrTtm,
        roeTtmValue: roeTtm,
        payoutRatioTtmValue: payoutRatioTtm,
        warnings,
      },
      update: {
        reportDate: reportDate ? new Date(`${reportDate}T00:00:00.000Z`) : null,
        sgrTtm,
        roeTtmValue: roeTtm,
        payoutRatioTtmValue: payoutRatioTtm,
        warnings,
      },
    });
  } catch (error) {
    console.error('[sgr]: 寫入 profitability_sgr 失敗，不影響本次回傳結果。', error);
  }

  return {
    companyId,
    year,
    season,
    dataType,
    subsidiaryCompanyId,
    reportDate,
    sgrTtm,
    roeTtm: { value: roeTtm },
    payoutRatioTtm: { value: payoutRatioTtm },
    warnings,
  };
};
