import type { IndustryPort } from '@/application/ports/industry';
import { getSecuritiesSectorCode, isFinancialIndustryCompany, isSoftwareOrCloudIndustryCompany } from './securitiesIndustry';

// application/ports/industry.ts 的實作——交易所 company_profile 的類股代碼（twse/tpex 兩邊）。
// 2026-09-28 金融業判斷改成 process 內快取：寫入層（persistComputations）對「金融業不適用」的指標每一筆 null 都會問一次，
// 全市場回填時同一家公司會問上千次，每次兩個跨庫查詢。
// ponytail: 產業代碼改變要重啟 process 才看得到（回填腳本每次都是新 process；長駐 server 過期的後果只是 nullReason 標籤晚一步），
// 要即時再改成 startupCache 那種有 reload 的 lifecycle。
const financialCache = new Map<string, Promise<boolean>>();
const cachedIsFinancial = (symbol: string): Promise<boolean> => {
  let hit = financialCache.get(symbol);
  if (!hit) {
    hit = isFinancialIndustryCompany(symbol).catch((error: unknown) => {
      financialCache.delete(symbol); // 失敗不留 rejected promise，下次重試
      throw error;
    });
    financialCache.set(symbol, hit);
  }
  return hit;
};

export const exchangeIndustry: IndustryPort = {
  isFinancialIndustryCompany: cachedIsFinancial,
  isSoftwareOrCloudIndustryCompany,
  getSecuritiesSectorCode,
};
