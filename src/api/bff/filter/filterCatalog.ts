import { loadFilterCatalog } from './loadFilterCatalog';

// 靜態登錄檔：列出目前資料庫裡「已實作」的指標欄位，給前端組 filter UI 用。
// 顆粒度是「欄位」層級（例如 grossMarginQuarterly / grossMarginTtm 分開列），
// 因為同一個比率的單季/TTM 口徑是資料庫裡兩個不同欄位，各自才是可以拿來 filter 的最小單位。
// key 對應 src/api/bff/metrics 底下的資料夾/檔案結構（2026-08-31 從 src/domains 底下搬進 metrics/
// 子資料夾，跟同層新開的 src/api/bff/preferredStock/ 分開——後者不是「公司季度財報」骨架的指標，
// 目前也還沒有任何欄位列進這份 catalog），跟各分類 README 的「指標清單」表格一一對應——
// 只列 ✅ 已實作的，未實作的指標不會出現在這裡（沒有資料可以 filter）。
// 新增指標時記得同步更新這裡，不然新指標不會出現在 /filters。
//
// 2026-09-05 起實際資料改放在 filterCatalog.csv（一列對應一個 FilterField，見
// loadFilterCatalog.ts 的解析邏輯）——domainMetrics 預期會大量成長，手寫巢狀 TS 物件字面量
// 不好排序/篩選/批次修改，CSV 可以直接用 Excel/Google Sheets 打開管理。這個檔案保留全部
// TypeScript 介面定義跟底下這一整段撰寫慣例（管的是資料品質，不管資料存在哪裡）——新增/修改
// 指標改去編輯 filterCatalog.csv，不是這個檔案。scripts/exportFilterCatalogToCsv.ts 是遷移
// 當時用的工具，也是之後需要重新產生 CSV 範本時的備用工具。
//
// **`name` 是要直接顯示給前端使用者看的文案，不是給開發者看的內部備註**——2026-08-28 踩過一次：
// 複合指標裡引用其他服務算出來的欄位（例如 dupont/nissimPenmanRnoa 的 actualRoe*，直接引用
// roe/ 算出來的數字），一開始把 name 寫成「實際 ROE（單季，引用自 roe/）」，把「這個欄位是怎麼
// 實作出來的」這種開發者才需要知道的細節，混進了使用者會看到的標籤裡（甚至直接洩漏了 `roe/`
// 這種內部資料夾路徑）。這類實作細節要寫成程式碼註解（放在該欄位定義的上一行），name 只能放
// 使用者理解這個數字需要的資訊。之後新增/修改任何 `name` 欄位前，先問自己：這句話前端使用者
// 看得懂、也需要知道嗎？如果答案是「這是講給下一個維護程式碼的人聽的」，就不該出現在這裡。
//
// **`name` 永遠不能出現標點符號，也不能放 period 資訊**（2026-08-28）：
// - 不要有任何括號、逗號、頓號、斜線——多個詞要並列時用空白字元分隔（空白不算標點符號）。
//   人名/專有名詞本身固有的連字號（Z-Score、F-Score、M-Score）算拼寫的一部分，不算違規。
// - 不要出現「單季」「TTM」「單季年化」這類 period 描述——每個 field 已經有結構化的 `period`
//   欄位帶這個資訊，重複寫進 name 只是把同一份資料存兩份，前端要組合成「淨利率（TTM）」這種
//   顯示文字，應該自己拿 name + period 組裝，不是 name 自己就把格式化結果算好給前端。
//   這也代表同一個指標底下，單季/年化/TTM 三個 field 的 name 現在會是同一個字串，這是預期行為，
//   不是漏改——靠 key 分辨是哪個 field，靠 period 分辨是哪個口徑，name 只負責「這是什麼」。
// - 判斷標準延續 2026-08-28 稍早訂的「簡短但識別力強」原則：括號/文字如果是「別名」（EPS、
//   Graham Number 這類）或「回看窗口長度」這種 period 欄位本身不描述的維度（Beta 的 1 年/2 年/
//   5 年——period 描述的是取樣頻率 daily/weekly/monthly，窗口長度是另一個維度，兩者剛好對應
//   不代表可以互相取代，拿掉窗口長度前端會需要額外知道「weekly 就是指 2 年」這種隱性對應關係），
//   才留；如果是公式細節或數值範圍這種該讓
//   README/文件講的東西（例如 Altman X1~X5 的公式、F-Score 的 0~9 分範圍），就整段拿掉。
//
// **人名/字母代號翻中文，沒有獨立會計意義就不要放（2026-08-30）**：判斷標準是「這段中文除了
// 告訴讀者『這是某個人發明的』或『這個字母是某人選的』以外，有沒有自己的意思」——
// - 「奧特曼」「皮爾托斯基」「貝尼許」「葛拉漢」這種人名音譯本身沒有會計意義，只用英文
//   （Altman Z-Score、Piotroski F-Score、Beneish M-Score、Graham Number）。
// - 「F 分數」「M 分數」「Z 分數」這類也一併拿掉——F/M/Z 只是發明者當初隨意選的字母，翻成中文
//   不會多出任何意義，跟人名音譯是同一種情況，不是「有會計意義的中文詞」。
// - 反過來，「淨流動資產價值」（NCAV）、「每股股東盈餘」（Owner Earnings）、「貝塔係數」（Beta）
//   這種是真正的會計/財務概念中文翻譯，即使概念是某人提出的，翻譯本身有獨立意義，要保留
//   （「貝塔」雖然也是希臘字母音譯，但「貝塔係數」是中文財務文獻通用的固定詞彙，不是「某人的姓氏」
//   這種要靠額外背景知識才看得懂的音譯，跟 F/M/Z 分數的情況不同）。
//
// **`description`/`source` 撰寫原則（2026-08-30，應 oingg-bff-ts 要求新增，給前端 info icon
// 提示用，競品研究報告點名「使用者不知道數字什麼意思/哪裡來的」是市場最大痛點之一）**：
// - `description` 放真正的財務公式/概念（例如「近四季稅後淨利加總 ÷ 期末股東權益」），業界通用的
//   方法論名稱也可以放（例如 Wilder's RSI——這是財務界公認的方法名，使用者可能會想查，不是我們
//   自己取的內部代號）；不能放我們自己的實作細節（內部檔案路徑、程式碼裡呼叫了哪個 service/
//   model、modelKey 是什麼），判斷標準跟 `name` 那條規則一樣：這句話是講給使用者聽的，還是講給
//   下一個維護程式碼的人聽的。
// - `source` 停在「哪份公開報表/哪個資料源」的顆粒度（例如「MOPS 季報財務比率」「TWSE 每日行情」
//   「TWSE 已計算之估值比率」「CBC 中央銀行統計」），不要寫到內部資料表/資料庫名稱（不寫
//   `quarterly_income_statement`，也不寫 `oingg-mops-ts 的資料庫`）。
// - 兩者都填在 `FilterMetric` 層級，`FilterField` 層級留空，由前端沿用 metric 的說明——同一個
//   指標底下單季/年化/TTM 概念相同，只有口徑不同，不需要每個 field 各寫一次幾乎一樣的句子；
//   只有某個口徑的算法真的需要額外說明時，才在該 field 補上覆蓋 metric 層級的版本。
//
// **`aliases` 撰寫原則（2026-08-31，`dupont`/`assetTurnoverRatio`/`netProfitMargin` 曾經同一個
// key 在不同 metric 底下寫成不同 name（總資產週轉率 vs 總資產周轉率、淨利率 vs 稅後淨利率）
// 才浮現的需求）**：
// - `name` 統一之後（顯示只留一種寫法），如果被拿掉的那個寫法是使用者可能會拿來搜尋的常見用詞，
//   就把它放進被統一那個 field 的 `aliases`，讓前端搜尋比對 name 的同時也比對 aliases，兩種寫法
//   都能查到、但畫面只顯示統一後的 name。
// - 只放「同一個東西的另一種寫法」（異體字、簡稱/全稱），不是拿來塞相關詞或近似指標的名稱。
// - 這個欄位不會出現在畫面上，所以不用擔心標點符號/簡潔度規則，但也別濫用。
//
// **`unit` 撰寫原則（2026-08-31，使用者要求——同一份 catalog 裡有的是 %、有的是金額，前端需要
// 知道才能決定顯示格式/單位符號）**：
// - 六種值：`percent`（%）、`currency`（新台幣，每股或絕對金額）、`times`（倍數/次數，PER、
//   周轉率、利息保障倍數這類）、`days`（天數）、`ratio`（公式算出來的無因次比值，沒有「倍」的
//   直覺，例如 Altman X1~X5、Beneish 8 個指數、ocfToNetIncome）、`score`（模型組裝出來的綜合
//   分數或二元訊號，例如 Z/F/M/O/X 分數、Ohlson 的 OENEG/INTWO，沒有實際財務單位）。
// - 判斷標準不是看欄位名稱有沒有 `Pct` 字尾（這個慣例不完全可靠——毛利率/營業利益率/稅後淨利率
//   這幾個明明是 % 但欄位名稱沒有 `Pct`），要看這個數字實際代表什麼：是兩個同單位金額相除
//   （% 或倍數）、是絕對金額（currency）、還是模型公式算出來、沒有直覺單位的原始比值（ratio/
//   score）。
// - 填在 `FilterMetric` 層級（必填，不能省略），只在同一個 metric 底下欄位單位真的不一樣時
//   （例如 dupont 的 assetTurnover/equityMultiplier 是 times，其餘是 percent；altmanZScore 的
//   zScore 是 score，X1~X5 是 ratio）才在該 `FilterField` 覆蓋。

export type FilterFieldPeriod = 'quarterly' | 'quarterlyAnnualized' | 'ttm' | 'snapshot' | 'daily' | 'weekly' | 'monthly';

// percent：百分比（%）。currency：新台幣金額（每股或絕對金額）。times：倍數/次數（PER 15 倍、
// 存貨周轉率 4 次、利息保障倍數 8 倍都算這類）。days：天數。ratio：公式算出來的無因次比值，
// 沒有「倍」的直覺（Altman X1~X5、Beneish 8 個指數、ocfToNetIncome 這種「比值明顯低於 1」的
// 描述都是這類，不是 %，也不是「幾倍」）。score：模型組裝出來的綜合分數/二元訊號（Z/F/M/O/X
// 分數、Ohlson 的 OENEG/INTWO 這種 0/1 旗標），沒有實際財務單位，純粹是模型算出來的點數。
export type FilterUnit = 'percent' | 'currency' | 'times' | 'days' | 'ratio' | 'score';

export interface FilterField {
  /** 對應該指標 API 回應 JSON 裡的欄位名稱 */
  key: string;
  /** 直接顯示給前端使用者看的文案——不放實作細節/內部路徑/標點符號/period 資訊，見檔案開頭說明 */
  name: string;
  period: FilterFieldPeriod;
  /** 給前端排序用，只在同一個 metric 的 fields 陣列內有意義（從 1 開始），不是全 catalog 唯一。 */
  sort: number;
  /** 選填——只在這個口徑（單季/年化/TTM⋯）的算法需要額外說明、跟 metric 層級的 description
   *  不夠涵蓋時才填，大多數情況留空、由前端沿用 metric.description，見檔案開頭「description/
   *  source 撰寫原則」。跟 name 同一套規則：只放使用者看得懂、需要知道的資訊，不放實作細節。 */
  description?: string;
  /** 選填，同上，只在跟 metric 層級的 source 不同時才填（極少見）。 */
  source?: string;
  /** 選填，同上，只在跟 metric 層級的 unit 不同時才填（例如 dupont 底下大多數欄位是 percent，
   *  但 assetTurnover/equityMultiplier 是 times，需要覆蓋）。 */
  unit?: FilterUnit;
  /** 選填——不顯示，純粹給前端搜尋比對用的同義詞（例如同一個字不同寫法：週轉率/周轉率）。
   *  只在「這個 field 原本或曾經有過另一種常見寫法，統一 name 後怕使用者查不到」時才填，
   *  平常不需要。見檔案開頭「aliases 撰寫原則」。 */
  aliases?: string[];
}

export interface FilterMetric {
  /** 對應 src/api/bff/metrics/<category>/<key> 資料夾名稱；同一個底層 API 拆成多個顯示分組時
   *  （見下方 modelKey 說明），這裡仍然要是全 catalog 唯一的識別碼。 */
  key: string;
  /** 直接顯示給前端使用者看的文案——不放實作細節/內部路徑/標點符號/period 資訊，見檔案開頭說明 */
  name: string;
  /** GET route path */
  path: string;
  /** 這個顯示分組的欄位實際對應哪個 prisma/analysis/schema.prisma 的 model（用 model 名稱去掉
   *  Result 字尾、字首小寫的 metric key 表示）——只有「一個 API/model 拆成多個顯示分組」時才需要
   *  填，例如 turnoverRatio 底下 9 個分組都對應同一個 TurnoverRatioResult，modelKey 統一填
   *  'turnoverRatio'，但各自的 key 不一樣。不填時預設等於自己的 key（一般情況，一個 metric
   *  對應一個 model）。見 2026-08-30 filterCatalogCheck.ts 的說明。 */
  modelKey?: string;
  /** 這個數字代表什麼意思、公式概念——給前端 info icon 提示用（2026-08-30 應 oingg-bff-ts
   *  要求新增）。只放真正的財務公式/業界通用方法名稱，不放內部實作細節，見檔案開頭「description/
   *  source 撰寫原則」。 */
  description?: string;
  /** 這個數字算自哪份公開報表/資料源——停在「MOPS 季報」「TWSE 每日行情」這種顆粒度，
   *  不要寫到內部資料表/資料庫名稱，見檔案開頭「description/source 撰寫原則」。 */
  source?: string;
  /** 這批欄位的單位——給前端決定要不要顯示 %/NT$ 這類單位符號用，見上面 FilterUnit 的說明。
   *  同一個 metric 底下大多數情況所有欄位單位一致，只在真的混雜時（例如 dupont）才需要在個別
   *  field 上覆蓋。 */
  unit: FilterUnit;
  fields: FilterField[];
}

export interface FilterCategory {
  /** 對應 src/api/bff/metrics/<key> 資料夾名稱 */
  key: string;
  /** 直接顯示給前端使用者看的文案——不放實作細節/內部路徑/標點符號/period 資訊，見檔案開頭說明 */
  name: string;
  metrics: FilterMetric[];
}


export const filterCatalog: FilterCategory[] = loadFilterCatalog();

// 總體經濟（macro，例如 equityRiskPremium）刻意不列在這裡——這份 catalog 的顆粒度是
// 「某支證券在某個時間點的欄位」，但總體經濟數字是全市場單一值，不分證券，不是使用者能拿來
// 篩選個股的東西（2026-08-31 使用者明確定調：只在運算中內部引用，不直接開放篩選）。
// 對應的例外處理見 filterCatalogCheck.ts 的 NON_SECURITY_MODEL_KEYS。
//
// 2026-09-05：technicals 分類（ma/rsi/kd/bollingerBands/atr/bias/macd，8 支指標）
// 使用者決定先刪除——domainMetrics/technicals/ 的計算邏輯、這裡的 catalog 條目都已移除，
// prisma/analysis/schema.prisma 的 8 張 technicals_* 表刻意保留未動（刪表是破壞性的資料庫
// 操作，不在這次範圍內，之後如果真的要刪再另外處理）。
