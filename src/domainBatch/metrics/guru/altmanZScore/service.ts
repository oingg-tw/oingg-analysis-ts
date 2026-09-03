import { analysisPrisma } from '@/adapters/prisma/analysisClient';
import { getMarketCapAsOf, hasStockPriceCoverage } from '@/shared/sourceData/marketCap';
import { getPriceAnchorDate } from '@/shared/sourceData/reportAnnouncementDate';
import { getLatestAvailableQuarter } from '@/shared/sourceData/latestQuarter';
import { getQuarterlyBalanceSheet } from '@/shared/sourceData/mopsQuarterlyStatements';
import { calculateInterestCoverage } from '@/domainBatch/metrics/solvency/interestCoverage/service';
import { calculateTurnoverRatio } from '@/domainBatch/metrics/turnover/turnoverRatio/service';
import { buildFieldStatuses, type MetricStatus } from '@/shared/metricStatus';
import type { Season } from '@/shared/rocQuarter';
import type { AltmanZScoreQuery, AltmanZScoreResult } from './types';

// 2026-08-24 從 solvency 移到 guru 分類時就講好要保留的適用性警告——這個模型是用上市製造業樣本
// 校準的，X5（營收/總資產）對產業結構特別敏感，套用到非製造業時分數僅供參考。這個警告固定出現
// 在每一次回應裡，不是條件式的（跟其他 warnings 只在真的缺資料/算不出來時才出現不一樣）。
const INDUSTRY_APPLICABILITY_WARNING =
  '原始版 Altman Z-Score 是用上市製造業樣本校準的模型，X5（營收/總資產）對產業結構特別敏感——套用到台股非製造業（電子代工以外的科技股、金融、服務、營建等）時，X5 會把跨產業的結構差異誤讀為財務訊號，分數僅供參考，不是精確的破產風險預測。若要全市場穩定判讀，Z\'\'-Score（非上市公司版）較適合，本服務目前只做原始版（應要求提供）。';

// year/season 沒指定時，自動抓「這家公司資產負債表跟損益表都有資料」的最新一季（X1/X2/X4 用
// 資產負債表、X3/X5 透過 interestCoverage/turnoverRatio 用到損益表），不是只看單一張表——
// 見 shared/sourceData/latestQuarter.ts 的說明，不同公司財報進度不同步是實測驗證過的真實狀況（2887 損益表
// 曾經卡在比資產負債表舊 3 季），只看資產負債表會誤判成「有資料」但其實那一季損益表是空的。
const resolveQuarter = async (
  companyId: string,
  dataType: string,
  subsidiaryCompanyId: string,
  year: string | undefined,
  season: Season | undefined
): Promise<{ year: string; season: Season } | null> => {
  if (year !== undefined && season !== undefined) return { year, season };
  return getLatestAvailableQuarter(companyId, dataType, subsidiaryCompanyId, ['balanceSheet', 'incomeStatement']);
};

const toRatio = (numerator: number, denominator: number): number | null => {
  if (denominator === 0) return null;
  return Math.round((numerator / denominator) * 10000) / 10000; // 保留 4 位小數（原始比率，不是百分比）
};

export const calculateAltmanZScore = async (query: AltmanZScoreQuery): Promise<AltmanZScoreResult> => {
  const { companyId, dataType, subsidiaryCompanyId } = query;
  const warnings: string[] = [INDUSTRY_APPLICABILITY_WARNING];

  const emptyResult = (year: string | null, season: Season | null, statuses: Array<[string, MetricStatus]>): AltmanZScoreResult => ({
    companyId,
    year,
    season,
    dataType,
    subsidiaryCompanyId,
    reportDate: null,
    zScore: null,
    zone: null,
    x1: null,
    x2: null,
    x3: null,
    x4: null,
    x5: null,
    marketCap: { value: null, tradeDate: null, priceAnchorSource: null },
    fieldStatuses: buildFieldStatuses(statuses),
    warnings,
  });

  const resolvedQuarter = await resolveQuarter(companyId, dataType, subsidiaryCompanyId, query.year, query.season);
  if (!resolvedQuarter) {
    warnings.push('查無任何一季的資產負債表資料，無法決定要用哪一季計算 Altman Z-Score。');
    const noData: MetricStatus = { status: 'no_data', message: '查無任何一季的資產負債表資料。' };
    return emptyResult(null, null, [
      ['zScore', noData],
      ['x1', noData],
      ['x2', noData],
      ['x3', noData],
      ['x4', noData],
      ['x5', noData],
    ]);
  }

  const { year, season } = resolvedQuarter;
  const yearNum = Number(year);
  const seasonNum = Number(season);
  const composedQuery = { companyId, year, season, dataType, subsidiaryCompanyId };

  // X3（EBIT TTM）、X5（營收 TTM/總資產）直接引用已經做好的 interestCoverage/turnoverRatio 服務，
  // 不重複實作 TTM 查詢邏輯——跟 grahamNumber 引用 eps/bvps 同一種模式。副作用是這兩支服務
  // 也會各自照常把自己的結果 upsert 進 solvency_interest_coverage/turnover_ratio，是預期行為。
  const [balanceSheet, interestCoverageResult, turnoverRatioResult] = await Promise.all([
    getQuarterlyBalanceSheet({ symbol: companyId, year: yearNum, quarter: seasonNum, dataType, subsidiaryCompanyId }),
    calculateInterestCoverage(composedQuery),
    calculateTurnoverRatio(composedQuery),
  ]);

  if (!balanceSheet) warnings.push(`查無 ${year}Q${season} 的資產負債表資料。`);

  const totalAssets = balanceSheet?.totalAssets ?? null;
  const totalLiabilities = balanceSheet?.totalLiabilities ?? null;
  const currentAssets = balanceSheet?.currentAssets ?? null;
  const currentLiabilities = balanceSheet?.currentLiabilities ?? null;
  const retainedEarnings = balanceSheet?.retainedEarnings ?? null;

  if (balanceSheet && currentAssets === null) {
    warnings.push(
      '該季資產負債表流動資產欄位為 null——常見於金融/保險業（資產負債表不按流動/非流動分類，跟 Graham_NCAV 踩過的坑一樣），X1 無法計算，這個公式本來就不適用這類產業。'
    );
  }
  if (balanceSheet && totalAssets === null) warnings.push('該季資產負債表總資產欄位為 null，X1/X2/X3/X5 都無法計算。');
  if (balanceSheet && totalLiabilities === null) warnings.push('該季資產負債表總負債欄位為 null，X4 無法計算。');
  if (balanceSheet && retainedEarnings === null) warnings.push('該季資產負債表保留盈餘欄位為 null，X2 無法計算。');

  let x1: number | null = null;
  if (currentAssets !== null && currentLiabilities !== null && totalAssets !== null) {
    x1 = toRatio(Number(currentAssets - currentLiabilities), Number(totalAssets));
  }

  let x2: number | null = null;
  if (retainedEarnings !== null && totalAssets !== null) {
    x2 = toRatio(Number(retainedEarnings), Number(totalAssets));
  }

  const ebitTtmValue = interestCoverageResult.ebitTtm.value;
  let x3: number | null = null;
  if (ebitTtmValue !== null && totalAssets !== null) {
    x3 = toRatio(Number(ebitTtmValue), Number(totalAssets));
  } else if (ebitTtmValue === null) {
    warnings.push('EBIT（TTM）無法取得（詳見 interestCoverage 服務的 warnings），X3 無法計算。');
  }

  const reportDate = balanceSheet?.reportDate ?? null;
  // X4 的股價基準要用「市場真正知道這季財報的那天」（財報公告日），不是財報期末日——期末日
  // 只是會計期間的結尾，市場那天根本還不知道財報數字，拿期末日當股價基準會有 look-ahead bias。
  // 優先查 financial_report_announcement 的公告日，查無資料（目前覆蓋率很低）才退回期末日，
  // 見 shared/sourceData/reportAnnouncementDate.ts 的說明。
  const priceAnchor = await getPriceAnchorDate(companyId, yearNum, seasonNum, reportDate);
  let marketCapValue: number | null = null;
  let marketCapTradeDate: string | null = null;
  let x4: number | null = null;
  if (priceAnchor) {
    if (priceAnchor.source === 'report_date_fallback') {
      warnings.push(
        `查無 ${year}Q${season} 的財報公告日（financial_report_announcement 目前只涵蓋少數公司/季度），X4 市值改用財報期末日（${priceAnchor.date.toISOString().slice(0, 10)}）估算，可能有 look-ahead bias——市場實際上要到公告日才知道這一季財報數字。`
      );
    }
    const marketCap = await getMarketCapAsOf(companyId, priceAnchor.date);
    if (marketCap) {
      marketCapValue = marketCap.marketCap;
      marketCapTradeDate = marketCap.tradeDate;
      // marketCapValue 是「股價 x 實際股數」算出來的真實新台幣金額，但財報金額欄位（包含
      // totalLiabilities）單位是千元——分母要先 x1000 換算成同一個單位再除，不然 X4 會差 1000 倍。
      // 這是 BVPS 曾經漏過的同一個坑（見 profitability/bvps/service.ts 的 toPerShare 註解）。
      if (totalLiabilities !== null) x4 = toRatio(marketCapValue, Number(totalLiabilities) * 1000);
    } else {
      warnings.push(
        `查無 ${companyId} 在 ${priceAnchor.date.toISOString().slice(0, 10)} 或之前的股價/股本資料，X4（市值/總負債）無法計算，見 fieldStatuses。`
      );
    }
  }

  // turnoverRatio 的 assetTurnoverTtm 本來就是「營收(TTM)/總資產」，單位（次）跟 X5 定義完全一樣，
  // 不需要另外換算或重新查詢。
  const x5 = turnoverRatioResult.assetTurnoverTtm;
  if (x5 === null) warnings.push('營收(TTM)/總資產無法取得（詳見 turnoverRatio 服務的 warnings），X5 無法計算。');

  let zScore: number | null = null;
  if (x1 !== null && x2 !== null && x3 !== null && x4 !== null && x5 !== null) {
    zScore = Math.round((1.2 * x1 + 1.4 * x2 + 3.3 * x3 + 0.6 * x4 + 0.999 * x5) * 100) / 100;
  }

  let zone: 'safe' | 'grey' | 'distress' | null = null;
  if (zScore !== null) {
    zone = zScore > 2.99 ? 'safe' : zScore < 1.81 ? 'distress' : 'grey';
  }

  // 覆蓋率會持續成長（見 shared/sourceData/marketCap.ts 的說明），不要寫死特定公司代號判斷——現查這家公司
  // 在 oingg-twse daily_price 裡有沒有任何資料，用來區分 X4 是「這家公司結構性不在覆蓋範圍內」
  // （not_applicable）還是「有覆蓋，這次查詢缺別的東西」（no_data）。
  const stockPriceCovered = x4 === null ? await hasStockPriceCoverage(companyId) : true;

  const fieldStatusEntries: Array<[string, MetricStatus] | null> = [
    x1 === null
      ? [
          'x1',
          // 要區分「整張資產負債表都查無資料」跟「資產負債表有資料、但流動資產欄位本身是 null」——
          // 後者才是「這個產業不適用」（金融/保險業資產負債表不按流動/非流動分類），前者單純是缺資料。
          balanceSheet && currentAssets === null
            ? { status: 'not_applicable' as const, message: '該季資產負債表沒有流動資產欄位，這個產業（多半是金融/保險業）不適用這個公式。' }
            : { status: 'no_data' as const, message: '查無該季資產負債表，或流動資產/流動負債/總資產欄位缺漏，無法計算 X1。' },
        ]
      : null,
    x2 === null ? ['x2', { status: 'no_data' as const, message: '保留盈餘或總資產缺漏，無法計算 X2。' }] : null,
    x3 === null ? ['x3', { status: 'no_data' as const, message: 'EBIT（TTM）或總資產缺漏，無法計算 X3。' }] : null,
    x4 === null
      ? [
          'x4',
          stockPriceCovered
            ? { status: 'no_data' as const, message: '市值或總負債缺漏，無法計算 X4。' }
            : { status: 'not_applicable' as const, message: 'daily_price 目前沒有這家公司的股價資料，這家公司不適用（不是資料還沒補齊，覆蓋率之後會持續成長）。' },
        ]
      : null,
    x5 === null ? ['x5', { status: 'no_data' as const, message: '營收（TTM）或總資產缺漏，無法計算 X5。' }] : null,
    zScore === null ? ['zScore', { status: 'no_data' as const, message: 'X1~X5 任一為 null，無法計算 Z-Score，見對應變數的 fieldStatuses。' }] : null,
  ];

  // 存進 oingg-analysis DB 的 guru_altman_z_score，供之後查歷史紀錄用。存檔失敗不應該讓已經算好的結果回傳失敗。
  try {
    await analysisPrisma.altmanZScoreResult.upsert({
      where: {
        symbol_year_season_dataType_subsidiaryCompanyId: { symbol: companyId, year: yearNum, season: seasonNum, dataType, subsidiaryCompanyId },
      },
      create: {
        symbol: companyId,
        year: yearNum,
        season: seasonNum,
        dataType,
        subsidiaryCompanyId,
        reportDate,
        zScore,
        x1,
        x2,
        x3,
        x4,
        x5,
        marketCapValue,
        marketCapTradeDate: marketCapTradeDate ? new Date(`${marketCapTradeDate}T00:00:00.000Z`) : null,
        warnings,
      },
      update: {
        reportDate,
        zScore,
        x1,
        x2,
        x3,
        x4,
        x5,
        marketCapValue,
        marketCapTradeDate: marketCapTradeDate ? new Date(`${marketCapTradeDate}T00:00:00.000Z`) : null,
        warnings,
      },
    });
  } catch (error) {
    console.error('[altman-z-score]: 寫入 guru_altman_z_score 失敗，不影響本次回傳結果。', error);
  }

  return {
    companyId,
    year,
    season,
    dataType,
    subsidiaryCompanyId,
    reportDate: reportDate ? reportDate.toISOString().slice(0, 10) : null,
    zScore,
    zone,
    x1,
    x2,
    x3,
    x4,
    x5,
    marketCap: { value: marketCapValue, tradeDate: marketCapTradeDate, priceAnchorSource: priceAnchor?.source ?? null },
    fieldStatuses: buildFieldStatuses(fieldStatusEntries),
    warnings,
  };
};
