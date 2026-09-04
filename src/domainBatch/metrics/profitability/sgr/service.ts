import { analysisPrisma } from '@/adapters/prisma/analysisClient';
import { calculateRoe } from '@/domainBatch/metrics/profitability/roe/service';
import { calculateDividendPayoutRatio } from '@/domainBatch/metrics/profitability/dividendPayoutRatio/service';
import { getLatestAvailableQuarter } from '@/shared/sourceData/latestQuarter';
import type { SgrQuery, SgrResult } from './types';

const emptyResult = (symbol: string, dataType: '1' | '2', subsidiaryCompanyId: string, warnings: string[]): SgrResult => ({
  symbol,
  year: null,
  season: null,
  dataType,
  subsidiaryCompanyId,
  reportDate: null,
  sgrTtm: null,
  roeTtm: { value: null },
  payoutRatioTtm: { value: null },
  warnings,
});

export const calculateSgr = async (query: SgrQuery): Promise<SgrResult> => {
  const { symbol, dataType, subsidiaryCompanyId } = query;
  const warnings: string[] = [];

  // year/season 沒指定時，自動抓「這家公司資產負債表/損益表/現金流量表都有資料」的最新一季——取
  // roe（['balanceSheet','incomeStatement']）跟 dividendPayoutRatio（['incomeStatement','cashFlowStatement']）
  // 兩支底層服務各自需要的表的聯集，見 shared/sourceData/latestQuarter.ts。
  const resolvedQuarter =
    query.year !== undefined && query.season !== undefined
      ? { year: query.year, season: query.season }
      : await getLatestAvailableQuarter(symbol, dataType, subsidiaryCompanyId, ['balanceSheet', 'incomeStatement', 'cashFlowStatement']);
  if (!resolvedQuarter) {
    return emptyResult(symbol, dataType, subsidiaryCompanyId, [
      '查無任何一季資產負債表/損益表/現金流量表都有資料的季度，無法決定要用哪一季計算 SGR。',
    ]);
  }
  const { year, season } = resolvedQuarter;
  const yearNum = Number(year);
  const seasonNum = Number(season);

  // 把解析出來的固定季度傳給 roe/dividendPayoutRatio，兩支底層服務都收到已經確定的 year/season，
  // 不會各自再重複解析一次（也不會各自解析出不同季度）。
  const resolvedQuery = { symbol, year, season, dataType, subsidiaryCompanyId };

  // 直接引用已經做好的 roe/、dividendPayoutRatio/ 服務，不重複實作查詢邏輯——
  // 副作用是這兩支服務各自也會 upsert 自己的 profitability_roe/profitability_dividend_payout_ratio，
  // 這是預期行為，不是意外（跟 grahamNumber 引用 eps/bvps 同一種模式）。
  const [roeResult, payoutRatioResult] = await Promise.all([calculateRoe(resolvedQuery), calculateDividendPayoutRatio(resolvedQuery)]);

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
        symbol_year_season_dataType_subsidiaryCompanyId: { symbol: symbol, year: yearNum, season: seasonNum, dataType, subsidiaryCompanyId },
      },
      create: {
        symbol: symbol,
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
    symbol,
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
