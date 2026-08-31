# 證券基本資訊（security_info）

- **scope**：Security
- **說明**：公司基本資料（名稱、產業、上市日期、股本結構、經營層⋯⋯），是靜態/低頻異動的識別資訊，不是算出來的財務指標。
- **狀態**：⬜ 未實作。
- **來源分類方案**：這是 2026-08-24 討論的「第二套分類方案」（8 類 + 大師策略）之一，跟這份文件本體的 investment_metrics_taxonomy v3.0 是不同的分類軸線，見 [`../README.md`](../README.md) 的「第二套分類方案」說明。原始分類表給的項目數是 26，但沒有逐項清單，下面只列已知確實存在、能對應到真實欄位的部分。

## 為什麼還沒做

這一類跟本服務其他所有分類的性質都不一樣——其他分類都是「查某公司某季的財報，算出一個比率」，這一類是「查某公司的基本資料，原封不動回傳」，不需要計算邏輯，比較接近查詢/relay，不是分析。目前完全沒有對應的 API/service，只是 2026-08-21 驗證市值查詢（見 [`../valuation/README.md`](../valuation/README.md)）時，順便發現 oingg-twse 有一張 `company_profile` 表，還沒鏡像進 `prisma/twse/schema.prisma`，也還沒有任何 domain 程式碼讀過它。

## 已知的真實資料來源

`company_profile`（oingg-twse，2026-08-21 用 `information_schema` 直接對正式資料庫內省過，欄位是 snake_case，還沒鏡像進本服務的 `prisma/twse/schema.prisma`）：

| 欄位（DB 原始名稱） | 說明 |
|---|---|
| `symbol` | 公司代號 |
| `name` / `short_name` / `english_short_name` | 公司全名／簡稱／英文簡稱 |
| `industry` | 產業別 |
| `established_date` / `listed_date` | 成立日期／上市日期 |
| `par_value` | 面額 |
| `paid_in_capital` | 實收資本額 |
| `issued_shares` | 已發行股數——[`../valuation/README.md`](../valuation/README.md) 的市值計算（市值 = 股價 x `issued_shares`）已經在用 |
| `private_placement_shares` / `preferred_stock_shares` | 私募股數／特別股股數 |
| `chairman` / `general_manager` / `spokesperson` | 董事長／總經理／發言人 |
| `auditing_firm` / `auditor1` / `auditor2` | 簽證會計師事務所／簽證會計師 |
| `stock_transfer_agency` | 股務代理機構 |
| `address` / `phone` / `email` / `website` | 聯絡資訊 |
| `financial_report_type` | 財報編製類型 |

1394 家公司都有 `issued_shares`（2026-08-21 驗證，覆蓋率完整）。查詢介面應該是純粹的 `companyId` 查詢，不需要 `year`/`season`，因為這是低頻異動的公司層級資料，不是季度財報——跟 [`../valuation/marketRatios/`](../valuation/marketRatios/) 已經走過的「不要套季度查詢模板」是同一個教訓。
