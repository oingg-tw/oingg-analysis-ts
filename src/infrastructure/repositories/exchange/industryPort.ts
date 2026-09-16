import type { IndustryPort } from '@/application/ports/industry';
import { isFinancialIndustryCompany, isSoftwareOrCloudIndustryCompany } from './securitiesIndustry';
import { getCompanySectionCode } from '../gov/industryClassification';

// application/ports/industry.ts 的實作——交易所 company_profile 的產業代碼（twse/tpex 兩邊）跟
// gov-ts 的 DGBAS 分類，兩個來源在這裡組成同一個 port。
export const exchangeIndustry: IndustryPort = {
  isFinancialIndustryCompany,
  isSoftwareOrCloudIndustryCompany,
  getCompanySectionCode,
};
