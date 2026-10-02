import type { IndustryReferenceDataPort } from '@/application/ports/industryReference';
import { listSecuritiesIndustrySectors, isValidSecuritiesSectorCode, listCompaniesBySectorCodes } from '@/infrastructure/repositories/exchange/securitiesIndustry';

// application/ports/industryReference.ts 的實作——把兩處 repository 的啟動快取存取器組成一個 port 物件，
// src/bootstrap/deps.ts 綁進 AppDeps。2026-10-02 gov 稅籍分類樹狀瀏覽下架，只剩證交所類股。
// 2026-09-20 使用者要求完全捨棄 playwright-py 供應鏈分類，原本這裡另外組進來的三個
// playwright repository（industryChainClassification/industryClusters/industryTree）已移除，
// 連帶拿掉的 port 方法見 industryReference.ts。
export const industryReferenceData: IndustryReferenceDataPort = {
  listSecuritiesIndustrySectors,
  isValidSecuritiesSectorCode,
  listCompaniesBySectorCodes,
};
