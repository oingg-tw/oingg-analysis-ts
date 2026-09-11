import type { PeriodType, LookbackRange, SamplingInterval, SnapshotCadence } from './metricBasis';

// 2026-09-10：「大師徽章」型別本身（命名法則/門檻/引用出處），內容見各自
// <metricCode>Badge.ts（跟 <metricCode>Definition.ts 同一個資料夾）——只有 11 支
// 指標有，其餘指標的 MetricDefinitionSpec.badge 維持 undefined，見下方 badge 欄位的
// 完整說明。
export interface MetricBadge {
  id: string;
  // 2026-09-10 補訂分工規則（先前沒訂，導致 13 筆各自混用「英文（中文）」/「中文（英文）」/
  // 純英文三種寫法，已全部校正過一次）：name/nameEn 不互相夾雜對方語言插入括號——這才是
  // 真正要擋的事，不是每個詞都被強制要求要有中文。法則本身如果在中文語境下已經有真實通用的
  // 譯名（不是自己發明的描述），name 用該中文譯名（例如 NCAV→淨流動資產價值、Sloan Accrual
  // Ratio→斯隆應計項目比率、Standardized Unexpected Earnings→標準化未預期盈餘）；如果沒有
  // 真實通用譯名、或這個詞本身在中文語境下就是照英文原文稱呼（例如 Altman Z-Score、Chowder
  // Rule），name 直接跟 nameEn 一樣整串保留英文，不要硬造一個沒人這樣叫的中文詞（Chowder
  // Rule 曾經被塞過「存股評分」這種自創描述，已移除）。額外限定語（例如「非上市公司版」）
  // 不要塞進 name 的括號，寫進 summary/detail 開頭說明即可。
  name: string;
  nameEn: string;
  // 法則/門檻的提出者或出處機構，正規化格式："<人名(s)>, <年份>"（例如 "Edward Altman,
  // 1968"、"Foster, Olsen & Shevlin, 1984, Bernard & Thomas, 1989"）或機構型出處沒有
  // 單一可指名年份時省略年份（例如 "S&P Dow Jones Indices"）——2026-09-10 統一過一次，
  // 不要用括號夾帶額外說明（例如 "機構（作者群，年份）"）或引號包裹暱稱這類不一致的寫法，
  // 那些補充資訊留給 detail 自然語言說明。跟 academicSourceUrl/referenceUrl 是同一組
  // 事實的不同呈現方式（那兩個是連結，這個是給徽章卡片直接顯示的文字），三者刻意不互相
  // 衍生，各自手動維護避免格式耦合。
  author: string;
  summary: string;
  detail: string;
  // 2026-09-10：這支指標本身要用哪個 token 讀值來套用這個門檻（例如 altmanZScore 用
  // 'TTM'，sue 用 'Q'，chowderNumber 用 'FY'），必須是這支 metricCode 自己
  // allowedPeriodTypes/allowedSnapshotCadences 陣列裡真的存在的值——前端不用自己猜
  // 該讀哪個 basis。allPositiveFieldIds 已經自帶完整 "metricCode.token" 字串
  // （例如 "eps.TTM"），token 語意已經內含在裡面，這種情況本欄位留空。
  token?: string;
  threshold: {
    // 人類可讀的門檻說明，只放門檻本身（例如 "> 2.99"），不要夾帶括號附註——2026-09-10
    // 補訂跟 name/nameEn 同一個原則：括號裡不塞資訊，真的要補充說明另外用 note 欄位，
    // 前端才能分開設計（例如門檻用大字強調、note 用小字附註），不用自己 parse 字串裡的
    // 括號。
    description: string;
    // 門檻的 LaTeX 數學式呈現（例如 "\mathrm{Z} > 2.99"），跟 MetricDefinitionSpec.formulaLatex
    // 同一套 @cortex-js/compute-engine 驗證機制（見 scripts/validateFormulaLatex.ts，這支腳本
    // 2026-09-10 已經一併掃描這個欄位），符號盡量跟這支指標自己 formulaLatex 用的符號一致
    // （例如 altmanZScore 用 \mathrm{Z}，跟它的 formulaLatex 定義符號同一個）；跨欄位比較
    // （compareAgainstFieldId，例如股價）用 \mathrm{Price} 這個既有慣例符號（跟 peRatio
    // 等既有 formulaLatex 用的符號一致）。description 是給不能/不需要渲染 LaTeX 的情境用的
    // plain text 備援，兩者刻意分開維護，不互相衍生。
    thresholdLatex: string;
    // 門檻本身的出處/限制/跟原論文差異這類補充說明（例如 "Altman 原始論文劃定的安全區
    // 下限"、"實務上常用的應計項目異常門檻，非 Sloan 原始論文的十分位法"），跟
    // description 分開存放；沒有補充說明時留空，不要為了填欄位硬湊一句話。
    note?: string;
    // 目前全部是 1（單一比較），保留這個欄位是因為 Piotroski 這類「N 選 M」門檻未來若
    // 找到能泛化表達的比較詞彙，denominator 就是那個 M（例如 9）。
    denominator: number;
    // 跟 value（固定常數比較）、valueMin/valueMax（'in_range' 時用的區間上下限）或
    // compareAgainstFieldId（比較另一支指標的值，例如 Graham Number/NCAV 是跟股價比較）
    // 三者擇一使用；allPositiveFieldIds 是第四種「多個欄位都要 > 0」的複合情境（S&P 500
    // 獲利資格門檻），這幾種情境下 comparator 可能不需要（allPositiveFieldIds 情境本身
    // 就是隱含的 gt 0，不需要額外宣告）。'in_range' 是 2026-09-10 補的——dividendPayoutRatio
    // 的 Fidelity 出處原文講的是「40%–60% 最適區間」（過高過低都不理想），不是單邊「< 60%
    // 安全上限」，原本用 lt/60 誤植了原文論點，改成 in_range 才能正確表達「落在區間內」
    // 這個語意，不能硬套單邊比較詞彙（見 dividendPayoutRatio/dividendPayoutRatioBadge.ts
    // 的更正說明）。
    comparator?: 'gt' | 'lt' | 'gte' | 'abs_lt' | 'in_range';
    value?: number;
    valueMin?: number;
    valueMax?: number;
    // 格式是 "metricCode.token"（例如 "stockPrice.Q"），指向另一支指標的值，語意是
    // 「compareAgainstFieldId 的值 {comparator} 這支指標自己的值」（例如 Graham Number
    // 門檻是「股價 < Graham Number」，compareAgainstFieldId 是 stockPrice.Q）。
    compareAgainstFieldId?: string;
    // 格式同上，多個 "metricCode.token"，語意是「這些欄位全部都要 > 0」。
    allPositiveFieldIds?: string[];
  };
}

interface MetricDefinitionSpecBase {
  metricCode: string;
  // 2026-09-09：給前端顯示用的中文名稱/單位——GET /metrics 之前只有 metricCode 跟四個
  // allowedXxx 陣列，沒有使用者可讀文案，前端沒辦法直接拿來組欄位選單。displayName 是
  // 精簡的中文指標名稱（常見英文縮寫視慣例保留，例如 ROE/EPS），unit 是這個數字的單位
  // （%、元、次、天、倍、分、無單位）——這兩個是給 UI 標籤用的最小可用集合，不是完整的
  // 公式/計算邏輯說明（那個看 formulaNote，太技術性不適合直接顯示給終端使用者）。
  displayName: string;
  unit: string;
  formulaNote: string;
  // 2026-09-10 新增：前後端統一算式顯示——使用者要求公式本身（不是 formulaNote 這種
  // 自然語言說明）由這裡儲存，前端忠實顯示，不要各自維護一份、算式跟後端實際公式對不上。
  // 存 LaTeX 字串（用 \mathrm{} 包多字元識別碼，例如 \mathrm{NetIncome}，避免被當成
  // 連續單字元符號相乘），用 @cortex-js/compute-engine 的 ce.parse(latex).json 驗證過
  // 語法正確、能還原成乾淨的 MathJSON，前端建議用同一個套件家族的 mathlive（唯讀模式）
  // 或純 KaTeX 渲染，不需要自己刻一份 LaTeX 字串。這是純顯示用途，不是要前端真的用
  // compute-engine 重新計算數值（財務數字用 bigint 算，compute-engine 走浮點數，
  // 精度語意跟我們的計算不一樣，不能拿來取代實際計算）。選填——先在少數指標試點，
  // 還沒補上的指標維持只有 formulaNote 這種自然語言說明。
  formulaLatex?: string;
  // 2026-09-10 新增：出處來源，維護者跟前端終端使用者都要能看——兩個都是超連結（公開可點
  // 進去查證的 URL，不是內部服務/table 名稱，呼應既有「資料來源欄位要放公開 URL」的規則），
  // 分成兩個獨立欄位是因為語意不同：
  // - academicSourceUrl：這個公式/模型本身的學術出處（作者/年份/論文），只有真的有單一
  //   可指名論文出處的大師模型/複合指標才填（Altman Z 系列、Piotroski F-Score、Beneish
  //   M-Score、Ohlson O-Score、Zmijewski Score、Graham Number、Fama-French RMW、SUE 等）。
  //   一般會計比率（ROE/流動比率/存貨週轉率這類教科書等級的通用比率）沒有單一論文出處，
  //   這個欄位維持 undefined，不要硬掰一個出處。
  // - referenceUrl：給終端使用者查證「這個指標的定義/算法」用的公開參考頁面（例如
  //   Investopedia、Wikipedia 這類穩定、免費、不需要訂閱就能看的頁面），大師模型也可以
  //   兩個欄位都填（referenceUrl 給一般讀者看的白話解釋，academicSourceUrl 給想找原始
  //   論文的人）。兩者都選填——沒有時維持 undefined，不是空字串，前端要處理「這支指標
  //   沒有出處連結」的情況。
  // 兩者都是逐一手動核對過連結真的存在、指向正確內容才填，不是憑印象猜測網址。
  academicSourceUrl?: string;
  referenceUrl?: string;
  // 2026-09-10 新增：使用者要求把指標分成三層，判斷依據是「這個數字是怎麼來的」，不是
  // 因子分類（dividend/efficiency/growth/...那個是主題分類，這個是計算複雜度分層），
  // 兩者正交：
  // - 'raw'：直接讀來源資料，本服務完全不做計算的 passthrough（交易所公告的殖利率/
  //   本益比/淨值比、股價本身、mops-ts 已經算好的銀行監理比率）。
  // - 'derived'：從基本財報數字做一次（或簡單多步）加減乘除算出來的單一比率/數字，
  //   本質是「很基本財報的數字加減乘除」——ROE/ROA/流動比率/毛利率/存貨週轉率這類
  //   教科書等級的通用比率都屬這層，即使背後有學術淵源（例如 famaFrenchOperatingProfitability/
  //   accrualsRatio），只要算式本身是單一比率就算 derived，不因為學術出處而升級成 composite。
  // - 'composite'：由多個因子相乘/加總組成的複合模型，或統計方法論（回歸/迴歸係數/
  //   共變異數估計），不是單一比率——Altman Z 系列/Piotroski/Beneish/Ohlson/Zmijewski
  //   這些大師評分模型、Graham Number/NCAV 這類命名估值公式、DuPont 拆解版 ROE（相乘多個
  //   因子）、SGR/Chowder Number（由兩個其他 derived 指標相加/相乘組成）、SUE（統計檢定量）、
  //   beta（共變異數/變異數估計，不是財報數字四則運算）都屬這層。
  // 必填——這是分類判斷，不像 academicSourceUrl/referenceUrl 那樣可能真的沒有東西可填。
  tier: 'raw' | 'derived' | 'composite';
  // 2026-09-10 新增：這支指標實際依賴的真實資料來源，給終端使用者查證用（web-nuxt
  // 前端 22 個元件原本各自手工維護 6 種資料來源標籤文字，改讀這裡統一維護）。刻意
  // 「不」從 dependsOn 自動推導——dependsOn 在這個 repo 沒有任何執行期消費者（grep
  // 驗證過），是完全不受強制檢查的文件性欄位，可能已經跟真實計算邏輯脫節，拿它當
  // source 的依據不可靠。這裡的值是逐一追蹤每支指標「實際 compute 檔案」（很多指標
  // 是共用 family orchestrator 檔案算出來的，不是自己資料夾裡那個檔案）真正 import
  // 的 @/shared/sourceData/* 模組（或直接查詢的 DB 表）人工核對過的結果，不是從
  // dependsOn 猜的。用固定的一組中文標籤（資產負債表/損益表/現金流量表/保險業損益
  // 明細表/股本變動申報/交易所每日收盤價/加權指數/交易所每日評價指標/銀行監理揭露），
  // 不要自創新標籤，也不要為了填欄位硬湊——只列真的餵進這支指標計算值的來源，純粹
  // 拿來定位 knowledgeDate（例如 stockPrice 借用資產負債表的 reportDate 但實際數值
  // 來自市場價）不算數。
  sources: string[];
  // 2026-09-10 新增：web-nuxt 原本在前端 app/utils/guru-badges.ts 手工維護一份「大師徽章」
  // 清單（12 支指標各自的命名法則/門檻/引用出處），因為當時 formulaLatex/referenceUrl 還沒
  // 做出來才暫時放前端；現在後端已經有出處欄位的先例，使用者要求把徽章資料也搬過來，避免
  // 兩邊repo各自維護一份、內容/門檻對不上。只有真的有「具名法則 + 明確門檻」的指標才填
  // （目前 11 支，Piotroski F-Score 是唯一例外——它的門檻判斷是 clamp(round(value),0,9)>=8
  // 這種「非完美 9/9 也算通過」的邏輯，下面 threshold 的比較詞彙表達不了，維持前端硬編碼，
  // 不寫進這裡）。選填，其餘 73 支沒有徽章維持 undefined。
  // 2026-09-10 拆檔：型別本身定義在這裡（MetricBadge，見下方），但每支指標的實際徽章
  // 內容（一大段中文 detail prose + threshold）搬到各自資料夾的 <metricCode>Badge.ts，
  // 跟 <metricCode>Definition.ts 分開——原因跟這個 session 稍早把 64 個 metricCode 定義
  // 從單一大檔案拆成各自資料夾同一個邏輯：徽章內容是大段獨立文案，跟公式/dependsOn 這些
  // 計算相關的宣告混在同一個物件字面值裡，會讓 Definition.ts 檔案變得很長、不好找兩種
  // 完全不同性質的內容各自在哪裡。
  badge?: MetricBadge;
  // 2026-09-11 使用者要求：dupontDecomposedRoe/dupontExtendedRoe 這類「拆解 ROE 用的中間
  // 因子組合」不該出現在 GET /filters 的指標選單/screener 篩選欄位裡——使用者篩選/排行時
  // 只需要 roe 本身，不需要看到「杜邦三因子拆解ROE」「杜邦五因子拆解ROE」這種對一般使用者
  // 沒有篩選意義的變體佔選單版面。選填，true 代表 scanMetricFolderCatalog() 略過這支指標，
  // 但指標本身照常計算/寫入 metric_values、GET /companies/dupont-history 等既有端點完全
  // 不受影響——只是不出現在「指標選單」這一層。其餘指標維持 undefined（=false，正常出現）。
  excludeFromFilterCatalog?: boolean;
  // 2026-09-06 起改存 mops-ts 驗證過的 XBRL account_code（export.xbrl_three_statements_long
  // 的 account_code 欄位，snake_case，是 mops-ts 自己整理過的命名，不是原始 IFRS PascalCase
  // 標籤）——之前用 mops-ts 原始欄位名稱（camelCase）是因為 XBRL 資料只涵蓋測試公司 1101，
  // 沒有真的公司可以驗證對應關係；mops-ts 現在已經補了 2330/2801 兩家真實公司的 XBRL 資料，
  // 這裡的對照關係都已經拿真實資料核對過，不是照標準科目名稱推論（見 UBIQUITOUS_LANGUAGE.md）。
  // 注意：這只是宣告內容改變（純字串），實際計算依然讀 quarterly_income_statement/
  // quarterly_balance_sheet（249 家公司覆蓋），不是切換去讀 XBRL 表——XBRL 目前只有 3 家
  // 公司有資料，拿來當計算來源會大幅縮減覆蓋率，不是這次的目的。
  dependsOn: string[];
  currentFormulaVersion: number;
}

// 2026-09-09：原本是 4 個並排陣列（allowedPeriodTypes/allowedLookbackRanges/
// allowedSamplingIntervals/allowedSnapshotCadences）+ allowedRollingWindowTokens，
// 每個 metricCode 只用得到其中一組，其餘固定填 ['N/A']——這個形狀是 2026-09-08
// metric_values 還沒拆表、三種指標共用一張表時的設計（DB 欄位本身就是這樣的 NOT NULL +
// sentinel 形狀）。2026-09-09 拆成 metric_values（純季報型）/
// metric_daily_cadence_values（逐日型）兩張表之後，「四陣列並排」在 DB 層面已經不對應
// 任何真實欄位了（例如 roe 宣告 allowedLookbackRanges: ['N/A']，但 roe 寫進的
// metric_values 表根本沒有 lookback_range 這個欄位）——改成 discriminated union，
// 每個 metricCode 只宣告它真正用得到的欄位。'period'（季報型，寫進 metric_values）/
// 'rollingWindow'（Beta 這類滾動統計量）/'snapshot'（純市場快照），後兩者都寫進
// metric_daily_cadence_values。外部 GET /metrics 回應原本也維持四陣列並排形狀，但
// bff-ts 早就完全改讀 validTokens、不再碰那四個陣列，2026-09-09 已經把這個形狀從外部
// 回應裡整個拿掉，metric_definitions 表也同一天改成單一 spec JSON 欄位直接存整個
// MetricDefinitionSpec——原本用來在兩種形狀之間轉換的 legacyAllowedArrays() adapter
// 已經沒有任何消費端，整個刪除。
//
// 2026-09-09 拆檔：這個型別本身從 metricDefinitionRegistry.ts 搬到這支獨立檔案——
// metricDefinitionRegistry.ts 之後要 import 全部 64 個定義檔案，如果型別留在
// metricDefinitionRegistry.ts，那 64 個定義檔案 import 型別時就會 import 回
// metricDefinitionRegistry.ts 本身，形成循環依賴。
export type MetricDefinitionSpec =
  | (MetricDefinitionSpecBase & { group: 'period'; allowedPeriodTypes: PeriodType[] })
  | (MetricDefinitionSpecBase & {
      group: 'rollingWindow';
      allowedLookbackRanges: LookbackRange[];
      allowedSamplingIntervals: SamplingInterval[];
      // 2026-09-08 補：allowedLookbackRanges x allowedSamplingIntervals **不是自由交叉
      // 組合**——bff-ts 拿 beta 實測發現 3x3=9 種組合裡只有 3 種（1Y_1D/2Y_1W/5Y_1M）
      // 真的有資料，其餘 6 種雖然通過舊版 fieldResolver 的獨立欄位驗證（各自都在允許
      // 清單內），實際查詢永遠是 total:0 的假選項。這個欄位是唯一正確合法組合來源，
      // token 格式跟 fieldResolver.ts 的 "<lookbackRange>_<samplingInterval>" 一致
      // （例如 "2Y_1W"）——resolveTokenForMetric 對這組的驗證要看這個陣列，不能各自
      // 檢查兩個獨立陣列的 includes()。
      allowedRollingWindowTokens: string[];
    })
  | (MetricDefinitionSpecBase & { group: 'snapshot'; allowedSnapshotCadences: SnapshotCadence[] });
