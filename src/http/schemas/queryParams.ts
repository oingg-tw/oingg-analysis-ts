import { z } from 'zod';

// query string 的共用 schema 片段。2026-09-24 建立，起因是同一個陷阱在這個 repo 踩了**三次**。
//
// **不要用 `z.coerce.boolean()`**：它底層是 JS 的 `Boolean(value)`，query string 只要是非空字串
// （包含字面上的 `"false"` 和 `"0"`）一律轉成 `true`，只有參數不存在或空字串才是 false。
// 實際後果：明確送 `excludeZero=false` 的呼叫端拿到的是**跟要求相反**的母體（2026-09-24 bff-ts 實測，
// 殖利率排名差了 278 家不配息公司），而且數字看起來完全合理、只是回答了另一個問題。
//
// 這個陷阱前兩次（companies 的 countOnly、securities 的 countOnly）都是「發現後在該檔案留一段註解」
// 收場，第三次（screener 的 excludeZero ×2）還是照樣踩到——因為**新寫 schema 的人不會去讀別的模組的
// 註解，而錯誤寫法比正確寫法更短**。註解贏不過一個更短的錯誤答案，helper 可以：現在正確寫法是最短的
// 那個，而且只有一份。
//
// 為什麼不用 `z.boolean()` 或 `z.enum(['true','false'])`：query string 的值一律是字串，而
// zod-to-openapi 文件化的是 **transform 前**的輸入 schema——用 optional string 才會在 OpenAPI 裡正確
// 呈現成「選填的字串參數」。enum 則會讓沒列到的值變成 400，對「省略即為預設」的旗標太嚴格。
export const booleanQueryParam = (description: string) =>
  z
    .string()
    .optional()
    .meta({ description: `${description}（只有 "true" 或 "1" 視為真，其餘含省略一律為假）` })
    .transform((value) => value === 'true' || value === '1');
