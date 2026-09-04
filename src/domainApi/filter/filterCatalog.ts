// 靜態登錄檔：列出目前資料庫裡「已實作」的指標欄位，給前端組 filter UI 用。
// 顆粒度是「欄位」層級（例如 grossMarginQuarterly / grossMarginTtm 分開列），
// 因為同一個比率的單季/TTM 口徑是資料庫裡兩個不同欄位，各自才是可以拿來 filter 的最小單位。
// key 對應 src/domainApi/metrics 底下的資料夾/檔案結構（2026-08-31 從 src/domains 底下搬進 metrics/
// 子資料夾，跟同層新開的 src/domainApi/preferredStock/ 分開——後者不是「公司季度財報」骨架的指標，
// 目前也還沒有任何欄位列進這份 catalog），跟各分類 README 的「指標清單」表格一一對應——
// 只列 ✅ 已實作的，未實作的指標不會出現在這裡（沒有資料可以 filter）。
// 新增指標時記得同步更新這裡，不然新指標不會出現在 /filters。
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
  /** 對應 src/domainApi/metrics/<category>/<key> 資料夾名稱；同一個底層 API 拆成多個顯示分組時
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
  /** 對應 src/domainApi/metrics/<key> 資料夾名稱 */
  key: string;
  /** 直接顯示給前端使用者看的文案——不放實作細節/內部路徑/標點符號/period 資訊，見檔案開頭說明 */
  name: string;
  metrics: FilterMetric[];
}

export const filterCatalog: FilterCategory[] = [
  {
    key: 'profitability',
    name: '獲利能力',
    metrics: [
      {
        key: 'eps',
        name: '每股盈餘 EPS',
        path: '/profitability/eps',
        description: '本期淨利 ÷ 流通股數，衡量每一股份分配到的獲利',
        source: 'MOPS 季報財務比率',
        unit: 'currency',
        fields: [
          { key: 'epsQuarterly', name: 'EPS', period: 'quarterly', sort: 1 },
          { key: 'epsQuarterlyAnnualized', name: 'EPS', period: 'quarterlyAnnualized', sort: 2 },
          { key: 'epsTtm', name: 'EPS', period: 'ttm', sort: 3 },
        ],
      },
      {
        key: 'bvps',
        name: '每股淨值 BVPS',
        path: '/profitability/bvps',
        description: '股東權益 ÷ 流通股數，衡量每一股份對應的帳面淨值',
        source: 'MOPS 季報財務比率',
        unit: 'currency',
        fields: [{ key: 'bvps', name: '每股淨值 BVPS', period: 'snapshot', sort: 1 }],
      },
      {
        key: 'revenuePerShare',
        name: '每股營收',
        path: '/profitability/revenue-per-share',
        description: '本期營收 ÷ 流通股數',
        source: 'MOPS 季報財務比率',
        unit: 'currency',
        fields: [
          { key: 'revenuePerShareQuarterly', name: '每股營收', period: 'quarterly', sort: 1 },
          { key: 'revenuePerShareQuarterlyAnnualized', name: '每股營收', period: 'quarterlyAnnualized', sort: 2 },
          { key: 'revenuePerShareTtm', name: '每股營收', period: 'ttm', sort: 3 },
        ],
      },
      // 底下 3 個顯示分組都來自同一支 API（GET /profitability/margins）、同一個 model
      // （MarginsResult），modelKey 統一填 'margins'——2026-08-30 從一個合併 metric（name 是
      // 3 種利潤率硬湊在一起的長字串）拆開，讓使用者在 /filters 清單裡能個別看到毛利率、
      // 營業利益率、稅後淨利率，跟 turnoverRatio 那次拆分同一種理由。
      {
        key: 'grossMargin',
        name: '毛利率',
        path: '/profitability/margins',
        modelKey: 'margins',
        description: '(營收 − 銷貨成本) ÷ 營收，衡量產品或服務本身的獲利能力',
        source: 'MOPS 季報財務比率',
        unit: 'percent',
        fields: [
          { key: 'grossMarginQuarterly', name: '毛利率', period: 'quarterly', sort: 1 },
          { key: 'grossMarginTtm', name: '毛利率', period: 'ttm', sort: 2 },
        ],
      },
      {
        key: 'operatingMargin',
        name: '營業利益率',
        path: '/profitability/margins',
        modelKey: 'margins',
        description: '營業利益 ÷ 營收，衡量本業經營的獲利能力',
        source: 'MOPS 季報財務比率',
        unit: 'percent',
        fields: [
          { key: 'operatingMarginQuarterly', name: '營業利益率', period: 'quarterly', sort: 1 },
          { key: 'operatingMarginTtm', name: '營業利益率', period: 'ttm', sort: 2 },
        ],
      },
      {
        key: 'netProfitMargin',
        name: '稅後淨利率',
        path: '/profitability/margins',
        modelKey: 'margins',
        description: '稅後淨利 ÷ 營收，衡量最終回歸股東的獲利比率',
        source: 'MOPS 季報財務比率',
        unit: 'percent',
        fields: [
          { key: 'netProfitMarginQuarterly', name: '稅後淨利率', period: 'quarterly', sort: 1 },
          { key: 'netProfitMarginTtm', name: '稅後淨利率', period: 'ttm', sort: 2 },
        ],
      },
      {
        key: 'roe',
        name: '股東權益報酬率 ROE',
        path: '/profitability/roe',
        description: '稅後淨利 ÷ 股東權益，衡量股東出資賺到的報酬率',
        source: 'MOPS 季報財務比率',
        unit: 'percent',
        fields: [
          { key: 'roeQuarterlyPct', name: 'ROE', period: 'quarterly', sort: 1 },
          { key: 'roeQuarterlyAnnualizedPct', name: 'ROE', period: 'quarterlyAnnualized', sort: 2 },
          { key: 'roeTtmPct', name: 'ROE', period: 'ttm', sort: 3 },
        ],
      },
      {
        key: 'roa',
        name: '總資產報酬率 ROA',
        path: '/profitability/roa',
        description: '稅後淨利 ÷ 總資產，衡量運用全部資產創造獲利的效率',
        source: 'MOPS 季報財務比率',
        unit: 'percent',
        fields: [
          { key: 'roaQuarterlyPct', name: 'ROA', period: 'quarterly', sort: 1 },
          { key: 'roaQuarterlyAnnualizedPct', name: 'ROA', period: 'quarterlyAnnualized', sort: 2 },
          { key: 'roaTtmPct', name: 'ROA', period: 'ttm', sort: 3 },
        ],
      },
      {
        key: 'roic',
        name: '投入資本回報率 ROIC',
        path: '/profitability/roic',
        description: '稅後淨營業利益 ÷ 投入資本（有息負債加股東權益），排除財務槓桿影響後的本業報酬率',
        source: 'MOPS 季報財務比率',
        unit: 'percent',
        fields: [
          { key: 'roicQuarterlyPct', name: 'ROIC', period: 'quarterly', sort: 1 },
          { key: 'roicQuarterlyAnnualizedPct', name: 'ROIC', period: 'quarterlyAnnualized', sort: 2 },
          { key: 'roicTtmPct', name: 'ROIC', period: 'ttm', sort: 3 },
        ],
      },
      {
        key: 'roce',
        name: '使用資本報酬率 ROCE',
        path: '/profitability/roce',
        description: '稅前息前淨利 ÷ (總資產 − 流動負債)，衡量運用長期資本創造獲利的效率',
        source: 'MOPS 季報財務比率',
        unit: 'percent',
        fields: [
          { key: 'roceQuarterlyPct', name: 'ROCE', period: 'quarterly', sort: 1 },
          { key: 'roceQuarterlyAnnualizedPct', name: 'ROCE', period: 'quarterlyAnnualized', sort: 2 },
          { key: 'roceTtmPct', name: 'ROCE', period: 'ttm', sort: 3 },
        ],
      },
      {
        key: 'dupont',
        name: '杜邦分析',
        path: '/profitability/dupont',
        description: '把 ROE 拆解成稅後淨利率、總資產周轉率、權益乘數三個因子，找出獲利能力的驅動來源',
        source: 'MOPS 季報財務比率',
        unit: 'percent',
        fields: [
          {
            key: 'netProfitMarginQuarterly',
            name: '稅後淨利率',
            period: 'quarterly',
            sort: 1,
            aliases: ['淨利率'],
          },
          { key: 'netProfitMarginTtm', name: '稅後淨利率', period: 'ttm', sort: 2, aliases: ['淨利率'] },
          {
            key: 'assetTurnoverQuarterly',
            name: '總資產周轉率',
            period: 'quarterly',
            sort: 3,
            unit: 'times',
            aliases: ['總資產週轉率'],
          },
          {
            key: 'assetTurnoverTtm',
            name: '總資產周轉率',
            period: 'ttm',
            sort: 4,
            unit: 'times',
            aliases: ['總資產週轉率'],
          },
          { key: 'equityMultiplier', name: '權益乘數', period: 'snapshot', sort: 5, unit: 'times' },
          {
            key: 'decomposedRoeQuarterlyPct',
            name: '組裝 ROE（杜邦）',
            period: 'quarterly',
            sort: 6,
            description: '用上面三個因子（稅後淨利率×總資產周轉率×權益乘數）相乘組裝回去的 ROE，理論上應等於實際 ROE，差異來自四捨五入',
          },
          { key: 'decomposedRoeTtmPct', name: '組裝 ROE（杜邦）', period: 'ttm', sort: 7 },
          // actualRoe* 是直接引用 roe/ 算出來的數字，用來對照 decomposedRoe* 拆解得準不準——
          // 這是內部實作細節，不要寫進 name（前端會直接顯示 name，不該出現 "roe/" 這種路徑）。
          // name 加上「（杜邦）」是為了跟 nissimPenmanRnoa 底下同名的「組裝 ROE」/「實際 ROE」區分，
          // 否則前端跨 metric 用 name 分組/搜尋時，使用者會看到兩組長得一樣的欄位卻不知道差在哪（2026-08-31 前端回報的實際案例）。
          {
            key: 'actualRoeQuarterlyPct',
            name: '實際 ROE（杜邦）',
            period: 'quarterly',
            sort: 8,
            description: '直接引用 ROE 指標算出來的實際值，用來對照左邊「組裝 ROE」拆解得準不準',
          },
          { key: 'actualRoeTtmPct', name: '實際 ROE（杜邦）', period: 'ttm', sort: 9 },
        ],
      },
      {
        key: 'dividendPayoutRatio',
        name: '配息率',
        path: '/profitability/dividend-payout-ratio',
        description: '現金股利總額 ÷ 稅後淨利，衡量獲利中有多少比例回饋給股東',
        source: 'MOPS 季報財務比率',
        unit: 'percent',
        fields: [{ key: 'payoutRatioTtm', name: '配息率', period: 'ttm', sort: 1 }],
      },
      {
        key: 'sgr',
        name: '可持續成長率 SGR',
        path: '/profitability/sgr',
        description: 'ROE × (1 − 配息率)，估計不靠外部融資、單靠保留盈餘能支撐的最高成長速度',
        source: 'MOPS 季報財務比率',
        unit: 'percent',
        fields: [{ key: 'sgrTtm', name: 'SGR', period: 'ttm', sort: 1 }],
      },
    ],
  },
  {
    key: 'cashFlow',
    name: '現金流量',
    metrics: [
      // 底下 2 個顯示分組都來自同一支 API（GET /cash-flow/cash-flow-per-share）、同一個 model
      // （CashFlowPerShareResult），modelKey 統一填 'cashFlowPerShare'——跟 margins/marketRatios
      // 同一種理由：OCF、FCF 是兩個獨立有意義的指標，不該擠在同一個 name 裡。
      {
        key: 'ocfPerShare',
        name: '每股營業現金流 OCF',
        path: '/cash-flow/cash-flow-per-share',
        modelKey: 'cashFlowPerShare',
        description: '本期營業活動現金流量 ÷ 流通股數',
        source: 'MOPS 季報財務比率',
        unit: 'currency',
        fields: [
          { key: 'ocfPerShareQuarterly', name: '每股營業現金流 OCF', period: 'quarterly', sort: 1 },
          { key: 'ocfPerShareQuarterlyAnnualized', name: '每股營業現金流 OCF', period: 'quarterlyAnnualized', sort: 2 },
          { key: 'ocfPerShareTtm', name: '每股營業現金流 OCF', period: 'ttm', sort: 3 },
        ],
      },
      {
        key: 'fcfPerShare',
        name: '每股自由現金流 FCF',
        path: '/cash-flow/cash-flow-per-share',
        modelKey: 'cashFlowPerShare',
        description: '(營業活動現金流量 + 資本支出) ÷ 流通股數，衡量扣除維持營運所需資本支出後，真正能自由運用的現金',
        source: 'MOPS 季報財務比率',
        unit: 'currency',
        fields: [
          { key: 'fcfPerShareQuarterly', name: '每股自由現金流 FCF', period: 'quarterly', sort: 1 },
          { key: 'fcfPerShareQuarterlyAnnualized', name: '每股自由現金流 FCF', period: 'quarterlyAnnualized', sort: 2 },
          { key: 'fcfPerShareTtm', name: '每股自由現金流 FCF', period: 'ttm', sort: 3 },
        ],
      },
      {
        key: 'ocfToNetIncome',
        name: '營運現金流對淨利比',
        path: '/cash-flow/ocf-to-net-income',
        description: '營業活動現金流量 ÷ 稅後淨利，比值明顯低於 1 代表帳面獲利缺乏真實現金流量支撐',
        source: 'MOPS 季報財務比率',
        unit: 'ratio',
        fields: [
          { key: 'ocfToNetIncomeQuarterly', name: '營運現金流對淨利比', period: 'quarterly', sort: 1 },
          { key: 'ocfToNetIncomeTtm', name: '營運現金流對淨利比', period: 'ttm', sort: 2 },
        ],
      },
      {
        key: 'accrualsRatio',
        name: '應計項目比率',
        path: '/cash-flow/accruals-ratio',
        description: '(稅後淨利 − 營業現金流 − 投資現金流) ÷ 總資產，數值偏高代表獲利中應計項目（非現金）比重偏高，盈餘品質存疑',
        source: 'MOPS 季報財務比率',
        unit: 'percent',
        fields: [
          { key: 'accrualsRatioQuarterly', name: '應計項目比率', period: 'quarterly', sort: 1 },
          { key: 'accrualsRatioQuarterlyAnnualized', name: '應計項目比率', period: 'quarterlyAnnualized', sort: 2 },
          { key: 'accrualsRatioTtm', name: '應計項目比率', period: 'ttm', sort: 3 },
        ],
      },
      {
        key: 'fcfYield',
        name: '自由現金流殖利率',
        path: '/cash-flow/fcf-yield',
        description: '每股自由現金流 ÷ 股價，用現金流角度衡量股價相對便宜或昂貴的程度',
        source: 'MOPS 季報財務比率與 TWSE 每日行情',
        unit: 'percent',
        fields: [
          { key: 'fcfYieldQuarterlyAnnualizedPct', name: '自由現金流殖利率', period: 'quarterlyAnnualized', sort: 1 },
          { key: 'fcfYieldTtmPct', name: '自由現金流殖利率', period: 'ttm', sort: 2 },
        ],
      },
    ],
  },
  {
    key: 'solvency',
    name: '償債能力',
    metrics: [
      // 底下 3 個顯示分組都來自同一支 API（GET /solvency/liquidity-ratio）、同一個 model
      // （LiquidityRatioResult），modelKey 統一填 'liquidityRatio'——同一種理由，三個是各自
      // 獨立有意義的比率，不該擠在同一個 name 裡。
      {
        key: 'currentRatio',
        name: '流動比率',
        path: '/solvency/liquidity-ratio',
        modelKey: 'liquidityRatio',
        description: '流動資產 ÷ 流動負債，衡量短期償債能力',
        source: 'MOPS 季報財務比率',
        unit: 'percent',
        fields: [{ key: 'currentRatioPct', name: '流動比率', period: 'snapshot', sort: 1 }],
      },
      {
        key: 'quickRatio',
        name: '速動比率',
        path: '/solvency/liquidity-ratio',
        modelKey: 'liquidityRatio',
        description: '(流動資產 − 存貨) ÷ 流動負債，比流動比率更嚴格，排除變現能力較差的存貨',
        source: 'MOPS 季報財務比率',
        unit: 'percent',
        fields: [{ key: 'quickRatioPct', name: '速動比率', period: 'snapshot', sort: 1 }],
      },
      {
        key: 'cashRatio',
        name: '現金比率',
        path: '/solvency/liquidity-ratio',
        modelKey: 'liquidityRatio',
        description: '現金及約當現金 ÷ 流動負債，衡量最極端情況下立即償債的能力',
        source: 'MOPS 季報財務比率',
        unit: 'percent',
        fields: [{ key: 'cashRatioPct', name: '現金比率', period: 'snapshot', sort: 1 }],
      },
      {
        key: 'debtRatio',
        name: '資產負債率',
        path: '/solvency/debt-ratio',
        description: '總負債 ÷ 總資產，衡量資產中有多少比例是靠借款支應',
        source: 'MOPS 季報財務比率',
        unit: 'percent',
        fields: [{ key: 'debtRatioPct', name: '資產負債率', period: 'snapshot', sort: 1 }],
      },
      {
        key: 'deRatio',
        name: '負債權益比',
        path: '/solvency/de-ratio',
        description: '總負債 ÷ 股東權益，衡量財務槓桿程度',
        source: 'MOPS 季報財務比率',
        unit: 'percent',
        fields: [{ key: 'deRatioPct', name: '負債權益比', period: 'snapshot', sort: 1 }],
      },
      {
        key: 'interestCoverage',
        name: '利息保障倍數',
        path: '/solvency/interest-coverage',
        description: '稅前息前淨利 ÷ 利息費用，衡量本業獲利足夠支付多少倍的利息負擔',
        source: 'MOPS 季報財務比率',
        unit: 'times',
        fields: [
          { key: 'interestCoverageQuarterly', name: '利息保障倍數', period: 'quarterly', sort: 1 },
          { key: 'interestCoverageTtm', name: '利息保障倍數', period: 'ttm', sort: 2 },
        ],
      },
      {
        key: 'netDebtToEbitda',
        name: '淨負債對 EBITDA 比',
        path: '/solvency/net-debt-to-ebitda',
        description: '(有息負債 − 現金) ÷ EBITDA，衡量用本業現金流量償還淨負債大約需要幾年',
        source: 'MOPS 季報財務比率',
        unit: 'times',
        fields: [
          { key: 'netDebtToEbitdaQuarterlyAnnualized', name: '淨負債對 EBITDA 比', period: 'quarterlyAnnualized', sort: 1 },
          { key: 'netDebtToEbitdaTtm', name: '淨負債對 EBITDA 比', period: 'ttm', sort: 2 },
        ],
      },
    ],
  },
  {
    key: 'turnover',
    name: '營運週轉',
    metrics: [
      // 底下 9 個顯示分組都來自同一支 API（GET /turnover/turnover-ratio）、同一個 model
      // （TurnoverRatioResult），modelKey 統一填 'turnoverRatio'——2026-08-30 從一個合併 metric
      // （name 是 4 種周轉率硬湊在一起的長字串）拆開，讓使用者在 /filters 清單裡能個別看到
      // 存貨/應收帳款/總資產/固定資產/應付帳款周轉率，以及 DIO/DSO/DPO/CCC 這 4 個週轉天數/週期
      // 指標，不用面對一個塞了 22 個欄位、名稱看不出全貌的巨大分組。
      {
        key: 'inventoryTurnoverRatio',
        name: '存貨周轉率',
        path: '/turnover/turnover-ratio',
        modelKey: 'turnoverRatio',
        description: '銷貨成本 ÷ 期末存貨，衡量存貨去化的速度',
        source: 'MOPS 季報財務比率',
        unit: 'times',
        fields: [
          { key: 'inventoryTurnoverQuarterly', name: '存貨周轉率', period: 'quarterly', sort: 1 },
          { key: 'inventoryTurnoverQuarterlyAnnualized', name: '存貨周轉率', period: 'quarterlyAnnualized', sort: 2 },
          { key: 'inventoryTurnoverTtm', name: '存貨周轉率', period: 'ttm', sort: 3 },
        ],
      },
      {
        key: 'receivablesTurnoverRatio',
        name: '應收帳款周轉率',
        path: '/turnover/turnover-ratio',
        modelKey: 'turnoverRatio',
        description: '營收 ÷ 期末應收帳款，衡量收現的速度',
        source: 'MOPS 季報財務比率',
        unit: 'times',
        fields: [
          { key: 'receivablesTurnoverQuarterly', name: '應收帳款周轉率', period: 'quarterly', sort: 1 },
          { key: 'receivablesTurnoverQuarterlyAnnualized', name: '應收帳款周轉率', period: 'quarterlyAnnualized', sort: 2 },
          { key: 'receivablesTurnoverTtm', name: '應收帳款周轉率', period: 'ttm', sort: 3 },
        ],
      },
      {
        key: 'assetTurnoverRatio',
        name: '總資產周轉率',
        path: '/turnover/turnover-ratio',
        modelKey: 'turnoverRatio',
        description: '營收 ÷ 期末總資產，衡量運用資產創造營收的效率',
        source: 'MOPS 季報財務比率',
        unit: 'times',
        fields: [
          { key: 'assetTurnoverQuarterly', name: '總資產周轉率', period: 'quarterly', sort: 1 },
          { key: 'assetTurnoverQuarterlyAnnualized', name: '總資產周轉率', period: 'quarterlyAnnualized', sort: 2 },
          { key: 'assetTurnoverTtm', name: '總資產周轉率', period: 'ttm', sort: 3 },
        ],
      },
      {
        key: 'fixedAssetTurnoverRatio',
        name: '固定資產周轉率',
        path: '/turnover/turnover-ratio',
        modelKey: 'turnoverRatio',
        description: '營收 ÷ 期末固定資產，衡量運用固定資產創造營收的效率',
        source: 'MOPS 季報財務比率',
        unit: 'times',
        fields: [
          { key: 'fixedAssetTurnoverQuarterly', name: '固定資產周轉率', period: 'quarterly', sort: 1 },
          { key: 'fixedAssetTurnoverQuarterlyAnnualized', name: '固定資產周轉率', period: 'quarterlyAnnualized', sort: 2 },
          { key: 'fixedAssetTurnoverTtm', name: '固定資產周轉率', period: 'ttm', sort: 3 },
        ],
      },
      {
        key: 'payablesTurnoverRatio',
        name: '應付帳款周轉率',
        path: '/turnover/turnover-ratio',
        modelKey: 'turnoverRatio',
        description: '銷貨成本 ÷ 期末應付帳款，衡量支付供應商貨款的速度',
        source: 'MOPS 季報財務比率',
        unit: 'times',
        fields: [
          { key: 'payablesTurnoverQuarterly', name: '應付帳款周轉率', period: 'quarterly', sort: 1 },
          { key: 'payablesTurnoverQuarterlyAnnualized', name: '應付帳款周轉率', period: 'quarterlyAnnualized', sort: 2 },
          { key: 'payablesTurnoverTtm', name: '應付帳款周轉率', period: 'ttm', sort: 3 },
        ],
      },
      {
        key: 'inventoryDays',
        name: 'DIO 存貨週轉天數',
        path: '/turnover/turnover-ratio',
        modelKey: 'turnoverRatio',
        description: '365 ÷ 存貨周轉率，換算成平均庫存天數',
        source: 'MOPS 季報財務比率',
        unit: 'days',
        fields: [
          { key: 'inventoryDaysQuarterlyAnnualized', name: 'DIO 存貨週轉天數', period: 'quarterlyAnnualized', sort: 1 },
          { key: 'inventoryDaysTtm', name: 'DIO 存貨週轉天數', period: 'ttm', sort: 2 },
        ],
      },
      {
        key: 'receivablesDays',
        name: 'DSO 應收帳款週轉天數',
        path: '/turnover/turnover-ratio',
        modelKey: 'turnoverRatio',
        description: '365 ÷ 應收帳款周轉率，換算成平均收現天數',
        source: 'MOPS 季報財務比率',
        unit: 'days',
        fields: [
          { key: 'receivablesDaysQuarterlyAnnualized', name: 'DSO 應收帳款週轉天數', period: 'quarterlyAnnualized', sort: 1 },
          { key: 'receivablesDaysTtm', name: 'DSO 應收帳款週轉天數', period: 'ttm', sort: 2 },
        ],
      },
      {
        key: 'payablesDays',
        name: 'DPO 應付帳款週轉天數',
        path: '/turnover/turnover-ratio',
        modelKey: 'turnoverRatio',
        description: '365 ÷ 應付帳款周轉率，換算成平均付款天數',
        source: 'MOPS 季報財務比率',
        unit: 'days',
        fields: [
          { key: 'payablesDaysQuarterlyAnnualized', name: 'DPO 應付帳款週轉天數', period: 'quarterlyAnnualized', sort: 1 },
          { key: 'payablesDaysTtm', name: 'DPO 應付帳款週轉天數', period: 'ttm', sort: 2 },
        ],
      },
      {
        key: 'cashConversionCycle',
        name: 'CCC 現金轉換週期',
        path: '/turnover/turnover-ratio',
        modelKey: 'turnoverRatio',
        description: '存貨週轉天數 加 應收帳款週轉天數 減 應付帳款週轉天數，衡量從付款進貨到收到貨款之間資金被卡住的天數',
        source: 'MOPS 季報財務比率',
        unit: 'days',
        fields: [
          { key: 'cashConversionCycleQuarterlyAnnualized', name: 'CCC 現金轉換週期', period: 'quarterlyAnnualized', sort: 1 },
          { key: 'cashConversionCycleTtm', name: 'CCC 現金轉換週期', period: 'ttm', sort: 2 },
        ],
      },
      {
        key: 'capexToRevenue',
        name: '資本支出佔營收比',
        path: '/turnover/capex-to-revenue',
        description: '資本支出 ÷ 營收，衡量相對營收規模投入了多少資本支出',
        source: 'MOPS 季報財務比率',
        unit: 'percent',
        fields: [
          { key: 'capexToRevenueQuarterly', name: '資本支出佔營收比', period: 'quarterly', sort: 1 },
          { key: 'capexToRevenueTtm', name: '資本支出佔營收比', period: 'ttm', sort: 2 },
        ],
      },
    ],
  },
  {
    key: 'valuation',
    name: '估值指標',
    metrics: [
      // 底下 3 個顯示分組都來自同一支 API（GET /valuation/market-ratios）、同一個 model
      // （MarketRatiosResult），modelKey 統一填 'marketRatios'——2026-08-30 從一個合併 metric
      // （name 是 3 個估值比率硬湊在一起的長字串）拆開，跟 margins/turnoverRatio 同一種理由。
      {
        key: 'per',
        name: '本益比 PER',
        path: '/valuation/market-ratios',
        modelKey: 'marketRatios',
        description: '股價 ÷ 每股盈餘，衡量股價相對獲利的貴便宜程度',
        source: 'TWSE 已計算之估值比率',
        unit: 'times',
        fields: [{ key: 'peRatio', name: '本益比 PER', period: 'daily', sort: 1 }],
      },
      {
        key: 'pbr',
        name: '股價淨值比 PBR',
        path: '/valuation/market-ratios',
        modelKey: 'marketRatios',
        description: '股價 ÷ 每股淨值，衡量股價相對帳面資產的貴便宜程度',
        source: 'TWSE 已計算之估值比率',
        unit: 'times',
        fields: [{ key: 'pbRatio', name: '股價淨值比 PBR', period: 'daily', sort: 1 }],
      },
      {
        key: 'dividendYield',
        name: '股息殖利率',
        path: '/valuation/market-ratios',
        modelKey: 'marketRatios',
        description: '近一年現金股利 ÷ 股價，衡量持股領取現金股利的報酬率',
        source: 'TWSE 已計算之估值比率',
        unit: 'percent',
        fields: [{ key: 'dividendYieldPct', name: '股息殖利率', period: 'daily', sort: 1 }],
      },
      {
        key: 'psr',
        name: '股價營收比 PSR',
        path: '/valuation/psr',
        description: '市值 ÷ 營收，用營收角度衡量股價的貴便宜程度，適合評估獲利尚未穩定的公司',
        source: 'MOPS 季報財務比率與 TWSE 每日行情',
        unit: 'times',
        fields: [
          { key: 'psrQuarterlyAnnualized', name: '股價營收比 PSR', period: 'quarterlyAnnualized', sort: 1 },
          { key: 'psrTtm', name: '股價營收比 PSR', period: 'ttm', sort: 2 },
        ],
      },
      {
        key: 'pFcf',
        name: '股價自由現金流比',
        path: '/valuation/p-fcf',
        description: '市值 ÷ 自由現金流，用現金流角度衡量股價的貴便宜程度',
        source: 'MOPS 季報財務比率與 TWSE 每日行情',
        unit: 'times',
        fields: [
          { key: 'pFcfQuarterlyAnnualized', name: '股價自由現金流比', period: 'quarterlyAnnualized', sort: 1 },
          { key: 'pFcfTtm', name: '股價自由現金流比', period: 'ttm', sort: 2 },
        ],
      },
      {
        key: 'evEbitda',
        name: '企業價值倍數',
        path: '/valuation/ev-ebitda',
        description: '企業價值（市值加淨負債）÷ EBITDA，衡量收購整家公司要付出的代價相對其稅前息前折舊攤銷前獲利的倍數，比本益比更不受資本結構跟折舊政策影響',
        source: 'MOPS 季報財務比率與 TWSE 每日行情',
        unit: 'times',
        fields: [
          { key: 'evToEbitdaQuarterlyAnnualized', name: '企業價值倍數', period: 'quarterlyAnnualized', sort: 1 },
          { key: 'evToEbitdaTtm', name: '企業價值倍數', period: 'ttm', sort: 2 },
        ],
      },
    ],
  },
  {
    key: 'guru',
    name: '大師指標',
    metrics: [
      {
        key: 'grahamNumber',
        name: 'Graham Number',
        path: '/guru/graham-number',
        description: 'sqrt(22.5 × 每股盈餘 × 每股淨值)，葛拉漢提出的保守估價公式，股價低於這個數字代表相對安全',
        source: 'MOPS 季報財務比率',
        unit: 'currency',
        fields: [{ key: 'grahamNumber', name: 'Graham Number', period: 'ttm', sort: 1 }],
      },
      {
        key: 'ncav',
        name: '淨流動資產價值 NCAV',
        path: '/guru/ncav',
        description: '(流動資產 − 總負債 − 特別股) ÷ 流通股數，葛拉漢提出的極端保守清算價值估算，股價低於這個數字的三分之二被視為有足夠安全邊際',
        source: 'MOPS 季報財務比率',
        unit: 'currency',
        fields: [
          { key: 'ncav', name: 'NCAV 淨流動資產價值', period: 'snapshot', sort: 1 },
          { key: 'marginOfSafetyPrice', name: '安全邊際價', period: 'snapshot', sort: 2 },
        ],
      },
      {
        key: 'ownerEarnings',
        name: '每股股東盈餘 Owner Earnings',
        path: '/guru/owner-earnings',
        description: '淨利加折舊攤銷減資本支出，巴菲特提出用來取代帳面淨利的股東實質可分配盈餘概念',
        source: 'MOPS 季報財務比率',
        unit: 'currency',
        fields: [
          { key: 'ownerEarningsPerShareQuarterly', name: '每股股東盈餘', period: 'quarterly', sort: 1 },
          { key: 'ownerEarningsPerShareQuarterlyAnnualized', name: '每股股東盈餘', period: 'quarterlyAnnualized', sort: 2 },
          { key: 'ownerEarningsPerShareTtm', name: '每股股東盈餘', period: 'ttm', sort: 3 },
        ],
      },
      {
        key: 'altmanZScore',
        name: 'Altman Z-Score 原始版',
        path: '/guru/altman-z-score',
        description: '五個財務比率加權組合，用來預測公司財務危機或破產風險的統計模型；原始版用上市製造業樣本校準，套用到非製造業僅供參考',
        source: 'MOPS 季報財務比率與 TWSE 每日行情',
        unit: 'ratio',
        fields: [
          { key: 'zScore', name: 'Z 分數', period: 'snapshot', sort: 1, unit: 'score' },
          // X1~X5 是 Altman 自己選的字母代號，沒有唯一、無歧義的業界慣用簡稱可以放進 name
          // （例如 X1 最接近的講法「營運資金比率」，容易被誤認成「流動比率」，是真實存在的用詞
          // 陷阱），所以公式改放這裡的 description，不是完全不講、也不硬塞進 name。
          {
            key: 'x1',
            name: 'X1',
            period: 'snapshot',
            sort: 2,
            description: '(流動資產−流動負債)÷總資產，衡量短期流動性佔資產的比重（跟「流動比率」是不同的比率，分母不一樣）',
          },
          { key: 'x2', name: 'X2', period: 'snapshot', sort: 3, description: '保留盈餘÷總資產，反映公司靠自身累積盈餘再投資的程度，隱含企業存續時間跟穩健度' },
          { key: 'x3', name: 'X3', period: 'ttm', sort: 4, description: 'EBIT（TTM）÷總資產，排除利息與稅負影響前的資產獲利能力' },
          {
            key: 'x4',
            name: 'X4',
            period: 'daily',
            sort: 5,
            description: '股權市值÷總負債帳面值，市場對公司負債的信任程度，數值越高代表資產價值下跌時的緩衝空間越大',
          },
          { key: 'x5', name: 'X5', period: 'ttm', sort: 6, description: '營收（TTM）÷總資產，衡量資產創造營收的週轉效率' },
        ],
      },
      {
        key: 'piotroskiFScore',
        name: 'Piotroski F-Score',
        path: '/guru/piotroski-f-score',
        // 分數範圍 0~9 屬於文件該講的事，不放進 name。
        description: '9 項財務體質訊號的加總分數（0～9 分），分數越高代表財務體質與獲利趨勢同時改善',
        source: 'MOPS 季報財務比率',
        unit: 'score',
        fields: [{ key: 'score', name: 'F 分數', period: 'snapshot', sort: 1 }],
      },
      {
        key: 'beneishMScore',
        name: 'Beneish M-Score',
        path: '/guru/beneish-m-score',
        description: '8 個財務比率組成的統計模型，用來偵測財報有沒有操縱獲利的跡象',
        source: 'MOPS 季報財務比率',
        unit: 'ratio',
        fields: [
          { key: 'mScore', name: 'M 分數', period: 'snapshot', sort: 1, unit: 'score' },
          {
            key: 'dsri',
            name: 'DSRI 應收帳款指數',
            period: 'snapshot',
            sort: 2,
            description: '本期(應收帳款÷營收)相對去年同期的比值，異常升高可能代表提前認列營收或收款狀況惡化',
          },
          {
            key: 'gmi',
            name: 'GMI 毛利率指數',
            period: 'snapshot',
            sort: 3,
            description: '去年同期毛利率相對本期毛利率的比值，大於 1 代表毛利率惡化，本業獲利壓力增加時操縱動機通常較強',
          },
          {
            key: 'aqi',
            name: 'AQI 資產品質指數',
            period: 'snapshot',
            sort: 4,
            description: '本期「非流動且非固定資產部分佔總資產比」相對去年同期的比值，異常升高可能代表把費用資本化藏進資產',
          },
          {
            key: 'sgi',
            name: 'SGI 營收成長指數',
            period: 'snapshot',
            sort: 5,
            description: '本期營收相對去年同期營收的比值，成長太快的公司操縱財報的誘因通常較大，不是說成長本身有問題',
          },
          {
            key: 'depi',
            name: 'DEPI 折舊指數',
            period: 'snapshot',
            sort: 6,
            description: '去年同期折舊率相對本期折舊率的比值，大於 1 代表折舊速度變慢，可能是拉長折舊年限美化財報',
          },
          {
            key: 'sgai',
            name: 'SGAI 管銷費用指數',
            period: 'snapshot',
            sort: 7,
            description: '本期(管銷費用÷營收)相對去年同期的比值，異常升高可能代表營運效率惡化或費用認列異常',
          },
          {
            key: 'tata',
            name: 'TATA 總應計利潤對總資產比',
            period: 'snapshot',
            sort: 8,
            description: '(本期稅後淨利−本期營業活動現金流量)÷總資產，數值越高代表帳面獲利中缺乏現金流量支撐的比例越高',
          },
          {
            key: 'lvgi',
            name: 'LVGI 槓桿指數',
            period: 'snapshot',
            sort: 9,
            description: '本期負債比率相對去年同期的比值，大於 1 代表財務槓桿上升，違約壓力增加',
          },
        ],
      },
      {
        key: 'nissimPenmanRnoa',
        name: 'Nissim Penman RNOA',
        path: '/guru/nissim-penman-rnoa',
        description: '把 ROE 拆解成本業報酬率（RNOA）跟財務槓桿放大效果兩部分，用來分辨高 ROE 是本業真的賺錢還是借錢堆出來的',
        source: 'MOPS 季報財務比率',
        unit: 'percent',
        fields: [
          { key: 'rnoaQuarterlyPct', name: 'RNOA 本業報酬率', period: 'quarterly', sort: 1 },
          { key: 'rnoaQuarterlyAnnualizedPct', name: 'RNOA 本業報酬率', period: 'quarterlyAnnualized', sort: 2 },
          { key: 'rnoaTtmPct', name: 'RNOA 本業報酬率', period: 'ttm', sort: 3 },
          { key: 'flev', name: 'FLEV 財務槓桿', period: 'snapshot', sort: 4, unit: 'times' },
          { key: 'nbcQuarterlyPct', name: 'NBC 淨借貸利率', period: 'quarterly', sort: 5 },
          { key: 'nbcTtmPct', name: 'NBC 淨借貸利率', period: 'ttm', sort: 6 },
          {
            key: 'spreadQuarterlyPct',
            name: 'SPREAD',
            period: 'quarterly',
            sort: 7,
            description: 'RNOA − NBC，本業報酬率減掉借款利率的利差，正值代表借錢投入本業是划算的（financial leverage 放大 ROE），負值代表借錢反而拖累 ROE',
          },
          { key: 'spreadTtmPct', name: 'SPREAD', period: 'ttm', sort: 8 },
          {
            key: 'reconstructedRoeQuarterlyPct',
            name: '組裝 ROE（RNOA）',
            period: 'quarterly',
            sort: 9,
            description: '用 RNOA + FLEV × SPREAD 組裝回去的 ROE，理論上應等於實際 ROE，差異來自四捨五入',
          },
          { key: 'reconstructedRoeTtmPct', name: '組裝 ROE（RNOA）', period: 'ttm', sort: 10 },
          // actualRoe* 是直接引用 roe/ 算出來的數字，用來對照 reconstructedRoe* 拆解得準不準——
          // 這是內部實作細節，不要寫進 name（前端會直接顯示 name，不該出現 "roe/" 這種路徑）。
          // name 加上「（RNOA）」是為了跟 dupont 底下同名的「組裝 ROE」/「實際 ROE」區分，
          // 否則前端跨 metric 用 name 分組/搜尋時，使用者會看到兩組長得一樣的欄位卻不知道差在哪（2026-08-31 前端回報的實際案例）。
          {
            key: 'actualRoeQuarterlyPct',
            name: '實際 ROE（RNOA）',
            period: 'quarterly',
            sort: 11,
            description: '直接引用 ROE 指標算出來的實際值，用來對照左邊「組裝 ROE」拆解得準不準',
          },
          { key: 'actualRoeTtmPct', name: '實際 ROE（RNOA）', period: 'ttm', sort: 12 },
        ],
      },
      {
        key: 'zmijewskiScore',
        name: 'Zmijewski Score',
        path: '/guru/zmijewski-score',
        // 門檻/機率範圍屬於文件該講的事，不放進 name。
        description: '財務危機統計預警模型，係數是用 1970～80 年代美國公司資料校準，套用到台股時絕對機率數字僅供參考，較適合看同一家公司的相對趨勢變化',
        source: 'MOPS 季報財務比率',
        unit: 'score',
        fields: [
          { key: 'xScore', name: 'X 分數', period: 'snapshot', sort: 1 },
          { key: 'probabilityOfDistress', name: '財務危機機率', period: 'snapshot', sort: 2, unit: 'percent' },
        ],
      },
      {
        key: 'ohlsonOScore',
        name: 'Ohlson O-Score',
        path: '/guru/ohlson-o-score',
        // 九個子變數（SIZE/TLTA/WCTA/CLCA/OENEG/NITA/FUTL/INTWO/CHIN）的公式見
        // src/domainBatch/metrics/guru/README.md，公式細節屬於文件該講的事，不放進 name。
        description: '財務危機統計預警模型，係數同樣是美國歷史資料校準，解讀限制跟 Zmijewski Score 相同',
        source: 'MOPS 季報財務比率',
        unit: 'ratio',
        fields: [
          { key: 'oScore', name: 'O 分數', period: 'snapshot', sort: 1, unit: 'score' },
          { key: 'probabilityOfBankruptcy', name: '財務危機機率', period: 'snapshot', sort: 2, unit: 'percent' },
          { key: 'size', name: 'SIZE', period: 'snapshot', sort: 3, description: 'ln(總資產)，公司規模的代理變數，原始模型沒有做通膨調整' },
          { key: 'tlta', name: 'TLTA', period: 'snapshot', sort: 4, description: '總負債÷總資產，財務槓桿程度', unit: 'percent' },
          {
            key: 'wcta',
            name: 'WCTA',
            period: 'snapshot',
            sort: 5,
            description: '(流動資產−流動負債)÷總資產，跟 Altman Z-Score 的 X1 是同一個概念（淨營運資金佔總資產比）',
          },
          { key: 'clca', name: 'CLCA', period: 'snapshot', sort: 6, description: '流動負債÷流動資產，短期償債壓力，分子分母跟「流動比率」相反' },
          { key: 'oeneg', name: 'OENEG', period: 'snapshot', sort: 7, description: '總負債是否大於總資產的二元訊號（1 代表是，資不抵債；0 代表否）', unit: 'score' },
          { key: 'nita', name: 'NITA', period: 'ttm', sort: 8, description: '稅後淨利（TTM）÷總資產，資產報酬率，概念跟 ROA 相同', unit: 'percent' },
          {
            key: 'futl',
            name: 'FUTL',
            period: 'ttm',
            sort: 9,
            description: '營運現金流量（TTM）÷總負債，用營運現金流量近似原始定義的 FFO（財報沒有現成欄位），衡量現金流量對總負債的覆蓋能力',
          },
          { key: 'intwo', name: 'INTWO', period: 'snapshot', sort: 10, description: '近兩年 TTM 稅後淨利是否都是負值的二元訊號（1 代表連續兩年虧損）', unit: 'score' },
          {
            key: 'chin',
            name: 'CHIN',
            period: 'snapshot',
            sort: 11,
            description: '(本期TTM淨利−去年同期TTM淨利)÷(兩者絕對值相加)，淨利變動幅度的標準化指標，介於 -1 到 1 之間',
          },
        ],
      },
    ],
  },
  {
    key: 'portfolio',
    name: '投資組合',
    metrics: [
      {
        key: 'beta',
        name: '貝塔係數 Beta',
        path: '/portfolio/beta',
        description: '個股報酬率相對大盤報酬率的共變異數除以大盤報酬率的變異數，衡量個股相對大盤的系統性風險',
        source: 'TWSE 每日行情',
        unit: 'ratio',
        fields: [
          // period 描述取樣頻率（1Y 用日資料、2Y 用週資料對齊 Bloomberg、5Y 用月資料對齊
          // Yahoo Finance，見 portfolio/beta/service.ts），不是回看窗口長度——兩者剛好一一對應
          // 不代表窗口長度可以從 period 反推，1 年/2 年/5 年是獨立的識別資訊，留在 name 裡。
          { key: 'beta1Y', name: 'Beta 1 年', period: 'daily', sort: 1 },
          { key: 'beta2Y', name: 'Beta 2 年', period: 'weekly', sort: 2 },
          { key: 'beta5Y', name: 'Beta 5 年', period: 'monthly', sort: 3 },
        ],
      },
    ],
  },
  // 總體經濟（macro，例如 equityRiskPremium）刻意不列在這裡——這份 catalog 的顆粒度是
  // 「某支證券在某個時間點的欄位」，但總體經濟數字是全市場單一值，不分證券，不是使用者能拿來
  // 篩選個股的東西（2026-08-31 使用者明確定調：只在運算中內部引用，不直接開放篩選）。
  // 對應的例外處理見 filterCatalogCheck.ts 的 NON_SECURITY_MODEL_KEYS。
  {
    key: 'technicals',
    name: '技術指標',
    metrics: [
      {
        key: 'ma',
        name: '移動平均線 MA',
        path: '/technicals/ma',
        description: '特定天數收盤價的簡單移動平均，用來平滑短期波動、判斷價格趨勢',
        source: 'TWSE 每日行情',
        unit: 'currency',
        fields: [
          { key: 'ma5d', name: '5 日均線', period: 'daily', sort: 1 },
          { key: 'ma10d', name: '10 日均線', period: 'daily', sort: 2 },
          { key: 'ma20d', name: '20 日均線', period: 'daily', sort: 3 },
          { key: 'ma60d', name: '60 日均線', period: 'daily', sort: 4 },
          { key: 'ma120d', name: '120 日均線', period: 'daily', sort: 5 },
          { key: 'ma200d', name: '200 日均線', period: 'daily', sort: 6 },
        ],
      },
      {
        key: 'rsi',
        name: '相對強弱指標 RSI',
        path: '/technicals/rsi',
        description: '特定天數內漲跌幅的相對強弱程度，用來判斷是否超買或超賣',
        source: 'TWSE 每日行情',
        unit: 'percent',
        fields: [
          { key: 'rsi6d', name: '6 日 RSI', period: 'daily', sort: 1 },
          { key: 'rsi14d', name: '14 日 RSI', period: 'daily', sort: 2 },
          { key: 'rsi24d', name: '24 日 RSI', period: 'daily', sort: 3 },
        ],
      },
      {
        key: 'kd',
        name: '隨機指標 KD',
        path: '/technicals/kd',
        description: '收盤價落在特定天數高低區間的相對位置，用來判斷短期動能轉折',
        source: 'TWSE 每日行情',
        unit: 'percent',
        fields: [
          { key: 'k9d', name: '9 日 K值', period: 'daily', sort: 1 },
          { key: 'd9d', name: '9 日 D值', period: 'daily', sort: 2 },
          { key: 'k14d', name: '14 日 K值', period: 'daily', sort: 3 },
          { key: 'd14d', name: '14 日 D值', period: 'daily', sort: 4 },
        ],
      },
      {
        key: 'bollingerBands',
        name: '布林通道',
        path: '/technicals/bollinger-bands',
        description: '移動平均線加減兩個標準差的價格區間，用來判斷波動區間跟潛在極值',
        source: 'TWSE 每日行情',
        unit: 'currency',
        fields: [
          { key: 'middle', name: '布林通道中軌', period: 'daily', sort: 1 },
          { key: 'upper', name: '布林通道上軌', period: 'daily', sort: 2 },
          { key: 'lower', name: '布林通道下軌', period: 'daily', sort: 3 },
        ],
      },
      {
        key: 'atr',
        name: '真實波動區間均值 ATR',
        path: '/technicals/atr',
        description: '特定天數內真實波動幅度的平均，衡量價格的絕對波動程度',
        source: 'TWSE 每日行情',
        unit: 'currency',
        fields: [
          { key: 'atr14d', name: '14 日 ATR', period: 'daily', sort: 1 },
          { key: 'atr20d', name: '20 日 ATR', period: 'daily', sort: 2 },
        ],
      },
      {
        key: 'bias',
        name: '乖離率 BIAS',
        path: '/technicals/bias',
        description: '收盤價偏離移動平均線的百分比，用來判斷股價是否過度偏離均值',
        source: 'TWSE 每日行情',
        unit: 'percent',
        fields: [
          { key: 'bias5d', name: '5 日乖離率', period: 'daily', sort: 1 },
          { key: 'bias20d', name: '20 日乖離率', period: 'daily', sort: 2 },
          { key: 'bias60d', name: '60 日乖離率', period: 'daily', sort: 3 },
        ],
      },
      {
        key: 'macd',
        name: 'MACD',
        path: '/technicals/macd',
        description: '兩條不同天期指數移動平均線的差離值，用來判斷趨勢轉折跟動能強弱',
        source: 'TWSE 每日行情',
        unit: 'currency',
        fields: [
          {
            key: 'dif',
            name: 'DIF',
            period: 'daily',
            sort: 1,
            description: '12 日 EMA − 26 日 EMA，快線減慢線的差離值，正值代表短期均線在長期均線之上（偏多）',
          },
          {
            key: 'dem',
            name: 'DEM',
            period: 'daily',
            sort: 2,
            description: 'DIF 再取 9 日 EMA 平滑後的訊號線，用來跟 DIF 交叉判斷買賣訊號',
          },
          {
            key: 'osc',
            name: 'OSC',
            period: 'daily',
            sort: 3,
            description: 'DIF − DEM，柱狀圖，數值放大代表動能增強、由正轉負或由負轉正代表趨勢可能反轉',
          },
        ],
      },
      // obv 刻意不列——BigInt 型別、絕對值沒有跨公司比較意義，不適合當篩選欄位，
      // 見 prisma/analysis/schema.prisma 的 ObvResult 註解。
    ],
  },
];
