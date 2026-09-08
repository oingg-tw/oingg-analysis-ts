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
  redemptionVerified: z.boolean().nullable().meta({
    description:
      '這檔是否經過人工查證章程確認收回權利（2026-09-08 mops-ts 新增）——跟 redemptionDate 是否為 null 是兩件事：' +
      '有些特別股（例如 1312A/2002A）已查證確認可收回，但條款本身沒有固定收回日，redemptionDate 仍是 null；' +
      '這個欄位用來區分「已查證、只是沒有固定日期」跟「還沒有人查證過」，null 代表查無此欄位資料，不代表未查證',
  }),
  ytcPct: z.number().nullable().meta({
    description:
      '贖回殖利率（Yield to Call）年化百分比，只在可贖回且發行價/配息/現價都齊全時才計算——沒有封閉解，用二分法對現金流現值公式求根。搭配 ytcAssumption 判斷這個數字的期數假設是什麼，不可贖回或缺輸入時為 null',
  }),
  ytcAssumption: z
    .enum(['scheduled_redemption_date', 'past_redemption_date_assumed_next_period', 'no_scheduled_redemption_date_assumed_next_period'])
    .nullable()
    .meta({
      description:
        "ytcPct 計算時期數(n)用的假設：'scheduled_redemption_date' 代表贖回日還在未來、n 是真實到贖回日的年數；" +
        "'past_redemption_date_assumed_next_period' 代表有排定贖回日但已經過了；" +
        "'no_scheduled_redemption_date_assumed_next_period' 代表條款本身就沒有排定贖回日（例如 1312A/2002A，公司可隨時自行決定，見 redemptionVerified）——" +
        '後兩種都是發行人隨時可能贖回但選擇還沒贖回、沒有下一個確定贖回時點的情境，n 用「下一次配息後即被贖回」的簡化假設，不是真實排定的贖回時間，' +
        '只是起點狀態不同（有過期日 vs 從來沒有日期）——前端顯示 ytcPct 時應該根據這個欄位額外標註警語，兩種情境的措辭應該不一樣',
    }),
  ytwPct: z.number().nullable().meta({
    description: 'YTW（最差殖利率）= min(currentYieldPct, ytcPct)，ytcPct 為 null 時退回等於 currentYieldPct（永續殖利率單獨成立）',
  }),
  premiumRatePct: z.number().nullable().meta({
    description: '溢價率 = (最新收盤價 − 發行價) / 發行價 * 100，只在可贖回（redeemable=true）時才計算——現價高於發行價代表投資人可能被發行人用發行價買回、被迫吃下溢價部分的損失；不可贖回或查無股價時為 null',
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
