import type { PeriodType, LookbackRange, SamplingInterval, SnapshotCadence } from './metricBasis';

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
