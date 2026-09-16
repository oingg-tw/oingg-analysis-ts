// 2026-09-13 依存反轉（DIP）全面鋪開的共用抽象層——先在 ROE 做過一次範例，使用者拍板全面
// 鋪開到其餘 116 支指標後抽出這個共用模組：87 支 compute*Pit.ts 的資料依賴只用到 7 種原始
// 查詢，每支各自定義一份幾乎一樣的單方法介面沒有意義。每個 Port 是「只有一個方法」的最小
// 介面（ISP），各 compute*Pit.ts 用交集型別組合出自己真正需要的子集。
//
// 2026-09-17 clean architecture 重構 Phase 3：介面本身搬到 application/ports/{financialStatements,
// capitalStock,marketData}.ts（DTO 型別一起搬，application 不再 import infrastructure 的型別），
// 這裡只 re-export 讓還沒遷移的 compute*Pit.ts 的 import 不用改。financialDataAdapter 是遷移期間
// 「用預設參數注入」的過渡實作——已遷移的 compute 改收顯式的 deps（見 metrics/deps.ts 的 PitDeps，
// 由 src/bootstrap/pitDeps.ts 綁定），全部 family 遷完後整支檔案刪除。

import type { IncomeStatementPort, BalanceSheetPort, CashFlowStatementPort, InsuranceIncomeStatementPort } from '@/application/ports/financialStatements';
import type { PaidInSharesPort } from '@/application/ports/capitalStock';
import type { StockPricePort, MarketCapPort } from '@/application/ports/marketData';
import { getBalanceSheetXbrlFirst } from '@/infrastructure/repositories/mops/balanceSheetXbrlFirst';
import { getIncomeStatementXbrlFirst } from '@/infrastructure/repositories/mops/incomeStatementXbrlFirst';
import { getCashFlowStatementXbrlFirst } from '@/infrastructure/repositories/mops/cashFlowStatementXbrlFirst';
import { getInsuranceIncomeStatementXbrlFirst } from '@/infrastructure/repositories/mops/insuranceIncomeStatementXbrlFirst';
import { getPaidInSharesAsOf } from '@/infrastructure/repositories/mops/capitalStock';
import { getStockPriceAsOf, getMarketCapAsOf } from '@/infrastructure/repositories/twse/marketCap';

export type { IncomeStatementPort, BalanceSheetPort, CashFlowStatementPort, InsuranceIncomeStatementPort, PaidInSharesPort, StockPricePort, MarketCapPort };

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
