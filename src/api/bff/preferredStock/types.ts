import { z } from 'zod';

// 2026-09-06 新增——特別股清單，見 controller.ts 的 getPreferredStocks 說明。
export const preferredStockEntrySchema = z.object({
  symbol: z.string().meta({ description: '特別股本身的證券代號，例如 "1101B"，跟發行公司的普通股代號（"1101"）不同' }),
  name: z.string(),
  isinCode: z.string(),
  listedDate: z.string(),
  marketType: z.string(),
  issueDate: z.string().nullable(),
  issuePrice: z.number().nullable().meta({ description: '發行價（新台幣元）' }),
  dividendRate: z.number().nullable().meta({ description: '每股固定配息金額（新台幣元），不是百分比——欄位名稱容易誤會' }),
  nominalDividendRatePct: z.number().nullable().meta({ description: '票面利率 = dividendRate/issuePrice*100，發行時基準，之後不隨股價變動' }),
  currentYieldPct: z.number().nullable().meta({ description: '目前殖利率 = dividendRate/最新收盤價*100，隨股價每天變動；查無股價資料時為 null' }),
  latestClosePrice: z.number().nullable(),
  latestPriceDate: z.string().nullable(),
  cumulativeDividend: z.boolean().nullable().meta({ description: '是否為累積特別股（該年度未發放的股息可以累積到以後年度）' }),
  participatingExcessDividend: z.boolean().nullable().meta({ description: '是否參與分配超額股利' }),
  liquidationPreference: z.boolean().nullable().meta({ description: '剩餘財產分配是否優先於普通股' }),
  votingRights: z.boolean().nullable(),
  convertible: z.boolean().nullable().meta({ description: '是否可轉換為普通股' }),
  conversionStartDate: z.string().nullable(),
  redeemable: z.boolean().nullable().meta({ description: '發行公司是否可強制買回（發行人贖回權/call，不是投資人賣回權/put——這批資料源沒有投資人賣回權的欄位）' }),
  redemptionDate: z.string().nullable(),
  redemptionConditions: z.string().nullable(),
  callRiskAmount: z
    .number()
    .nullable()
    .meta({
      description:
        '買回風險 = 發行價 - 最新收盤價（新台幣元），只在可贖回（redeemable=true）時才計算——發行人贖回是按發行價買回，現價高於發行價時這個值是負的，代表投資人用市價買進卻只能拿回發行價，可能被迫吃下這個負值大小的損失；不可贖回或查無股價時為 null',
    }),
});
export type PreferredStockEntry = z.infer<typeof preferredStockEntrySchema>;

// 顆粒度只到「來源」，不到逐欄位——每個 entry 都是同樣這三個上游來源合併出來的，逐欄位
// 標記對這批資料來說是不必要的重複資訊，見 controller.ts 的 PREFERRED_STOCK_DATA_SOURCES。
// 逐欄位對照表留在 README.md（人看的文件），這裡只回答「查證時要去哪個公開頁面對」。
//
// 2026-09-07 原本用內部 table 名稱（例如 export.preferred_stock_right），使用者指出這對
// 終端使用者沒有意義（看不到也查不了我們的內部資料庫）——改成跟 twse-ts/mops-ts 要來的
// 公開查證頁面 URL。這些大多是互動查詢頁（使用者要自己輸入公司代號/日期），不是能直接
// 帶參數跳到某一筆記錄的深連結，`note` 欄位說明這個限制，避免使用者誤以為點了就會看到
// 對應那一列。
export const preferredStockDataSourceSchema = z.object({
  name: z.string().meta({ description: '這個公開查證來源的名稱', example: 'MOPS 特別股權利基本資料查詢' }),
  url: z.string().meta({ description: '公開查證頁面網址', example: 'https://mopsov.twse.com.tw/mops/web/t47sb12' }),
  note: z.string().nullable().meta({ description: '查證時的補充說明（例如是互動查詢頁、需要自行輸入哪些條件，不是深連結）' }),
});
export type PreferredStockDataSource = z.infer<typeof preferredStockDataSourceSchema>;

export const preferredStocksResultSchema = z.object({
  count: z.number().meta({ description: '符合條件（套用 symbol 篩選後）的總筆數，不受 limit/offset 影響' }),
  limit: z.number(),
  offset: z.number(),
  dataSources: z
    .array(preferredStockDataSourceSchema)
    .meta({ description: '這份清單合併自哪些上游資料表——顆粒度到表，不到逐欄位（逐欄位對照見 README.md），每個 entry 都是同一組來源組成的' }),
  entries: z.array(preferredStockEntrySchema),
});
export type PreferredStocksResult = z.infer<typeof preferredStocksResultSchema>;
