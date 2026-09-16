// 2026-09-13 依存反轉（DIP）全面鋪開的共用抽象層——先在 ROE 做過一次範例（見
// profitability/roe/computeRoePit.ts 的說明），使用者拍板全面鋪開到其餘 116 支指標後
// 抽出這個共用模組，理由：87 支 compute*Pit.ts 檔案的資料依賴只用到 6 種原始查詢（損益表/
// 資產負債表/現金流量表/流通股數/股價/市值），每支各自定義一份幾乎一樣的單方法介面沒有
// 意義，只會重複 87 次。
//
// 每個 Port 是「只有一個方法」的最小介面（Interface Segregation Principle：一支指標只需要
// 損益表就只依賴 IncomeStatementPort，不會被迫依賴它用不到的資產負債表方法）。各
// compute*Pit.ts 用交集型別組合出自己真正需要的子集（例如 IncomeStatementPort &
// BalanceSheetPort），不是每支都依賴同一個大介面。financialDataAdapter 是唯一一個具體
// 實作，用結構型別（structural typing）天生就能滿足任何子集交集型別，所以全部 87 支
// 檔案共用同一個 adapter 常數當預設值，不用各自組裝。
//
// 這一層只涵蓋「查財報/股價/股本」這個依賴——knowledgeDate 解析（resolveKnowledgeDate）
// 跟寫入（writeMetricValue）維持直接依賴具體實作，跟 ROE 範例的既有說明一致，這兩層的
// DIP 是否要做是另一個決定，這次沒有涵蓋。

import { getBalanceSheetXbrlFirst, type BalanceSheetFields } from '@/infrastructure/repositories/mops/balanceSheetXbrlFirst';
import { getIncomeStatementXbrlFirst, type IncomeStatementFields } from '@/infrastructure/repositories/mops/incomeStatementXbrlFirst';
import { getCashFlowStatementXbrlFirst, type CashFlowFields } from '@/infrastructure/repositories/mops/cashFlowStatementXbrlFirst';
import { getInsuranceIncomeStatementXbrlFirst, type InsuranceIncomeStatementFields } from '@/infrastructure/repositories/mops/insuranceIncomeStatementXbrlFirst';
import { getPaidInSharesAsOf, type PaidInSharesAsOf } from '@/infrastructure/repositories/mops/capitalStock';
import { getStockPriceAsOf, getMarketCapAsOf, type StockPriceAsOf, type MarketCapAsOf } from '@/infrastructure/repositories/twse/marketCap';
import type { QuarterlyKey } from '@/domain/financials/quarterlyKey';

export interface IncomeStatementPort {
  getIncomeStatement(key: QuarterlyKey): Promise<IncomeStatementFields | null>;
}

export interface BalanceSheetPort {
  getBalanceSheet(key: QuarterlyKey): Promise<BalanceSheetFields | null>;
}

export interface CashFlowStatementPort {
  getCashFlowStatement(key: QuarterlyKey): Promise<CashFlowFields | null>;
}

export interface InsuranceIncomeStatementPort {
  getInsuranceIncomeStatement(key: QuarterlyKey): Promise<InsuranceIncomeStatementFields | null>;
}

export interface PaidInSharesPort {
  getPaidInShares(symbol: string, asOfDate: Date): Promise<PaidInSharesAsOf | null>;
}

export interface StockPricePort {
  getStockPrice(symbol: string, asOfDate: Date): Promise<StockPriceAsOf | null>;
}

export interface MarketCapPort {
  getMarketCap(symbol: string, asOfDate: Date): Promise<MarketCapAsOf | null>;
}

// 唯一的具體實作（XBRL + 股本申報 + 每日行情），用交集型別宣告型別，讓 TypeScript
// 結構型別驗證這個物件同時滿足全部 7 個 Port——任何一支 compute*Pit.ts 不管需要
// 哪個子集，都能直接把這個常數當預設值傳進去。
export const financialDataAdapter: IncomeStatementPort &
  BalanceSheetPort &
  CashFlowStatementPort &
  InsuranceIncomeStatementPort &
  PaidInSharesPort &
  StockPricePort &
  MarketCapPort = {
  getIncomeStatement: getIncomeStatementXbrlFirst,
  getBalanceSheet: getBalanceSheetXbrlFirst,
  getCashFlowStatement: getCashFlowStatementXbrlFirst,
  getInsuranceIncomeStatement: getInsuranceIncomeStatementXbrlFirst,
  getPaidInShares: getPaidInSharesAsOf,
  getStockPrice: getStockPriceAsOf,
  getMarketCap: getMarketCapAsOf,
};
