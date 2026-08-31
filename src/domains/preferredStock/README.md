# 特別股（preferred_stock）

- **scope**：Security（特別股本身是獨立的證券，不是發行公司底下的一個欄位——例如 1101 台泥的普通股 vs 1101B 台泥乙特，是兩檔不同的證券）
- **狀態**：⬜ 未實作，準備中。
- **跟 `../metrics/` 的關係**：`src/domains/metrics/` 底下的分類（`profitability`/`valuation`/`guru`⋯⋯）全部假設「一家公司 + 季度財報（MOPS）+ 股價（TWSE）」這個骨架，特別股不是新公司、也沒有自己的季度損益表可以拆解，硬塞進 `metrics/` 的心智模型會很彆扭，2026-08-31 使用者決定另外開一個平行分類。之後如果要做 REITs／ETF／興櫃／KY 股票專區，預期也會在這裡開平行的子資料夾，不是各自獨立的頂層分類。

## 已知的三個真實資料來源（2026-08-31 用 live DB 驗證過）

| 資料 | 現況 |
|---|---|
| TWSE `isin_securities` | 正式 DB 已存在（1055 股票／240 ETF／**28 特別股**／其他），用 `security_type = '特別股'` 判斷，例如 `1101B` 台泥乙特、`1312A` 國喬特。**還沒鏡像進 `prisma/twse/schema.prisma`**，是三者之中唯一真的缺的一塊，跟 `../metrics/securityInfo/README.md` 記錄的 `company_profile` 是同一種「表存在、還沒接」狀態。 |
| TWSE `daily_price` 特別股資料 | 已經鏡像好了（`prisma/twse/schema.prisma` 的 `DailyPrice`），資料本身也有——用 `1101B` 驗證過有真實成交價。不需要新表，只是之後查詢時要靠 `isin_securities` 篩出哪些 symbol 是特別股。 |
| MOPS `PreferredStockRights` | 已經鏡像好了，`prisma/schema.prisma`（mops 鏡像）的 `preferred_stock_right` model，20+ 欄位（`dividend_rate`／`convertible`／`redeemable`／`redemption_conditions`／`cumulative_dividend`⋯⋯）都有。 |

## 下一步（還沒動工）

1. 在 `prisma/twse/schema.prisma` 補 `isin_securities` 的鏡像 model（表已存在，只是 introspect 進來）。
2. 決定要做的是「查詢/relay」（特別股清單 + 條款 + 現價原封不動組出來，性質接近 `../metrics/securityInfo/`）還是「真正的二次加工指標」（例如特別股殖利率、轉換溢價——這種才需要在 `prisma/analysis/schema.prisma` 開新表存計算結果，模式比照 `PsrResult`）。這會決定要不要有自己的 `service.ts`/持久化表，還是純 relay 不進 `filterCatalog.ts`。
