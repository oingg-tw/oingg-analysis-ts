import type { PeriodType, LookbackRange, SamplingInterval, SnapshotCadence } from './metricBasis';

interface MetricDefinitionSpecBase {
  metricCode: string;
  // 2026-09-09：給前端顯示用的中文名稱/單位——GET /filters 之前只有 metricCode 跟四個
  // allowedXxx 陣列，沒有使用者可讀文案，前端沒辦法直接拿來組欄位選單。displayName 是
  // 精簡的中文指標名稱（常見英文縮寫視慣例保留，例如 ROE/EPS），unit 是這個數字的單位
  // （%、元、次、天、倍、分、無單位）——這兩個是給 UI 標籤用的最小可用集合，不是完整的
  // 公式/計算邏輯說明（那個看 formulaNote，太技術性不適合直接顯示給終端使用者）。
  displayName: string;
  unit: string;
  formulaNote: string;
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
// metric_daily_cadence_values。外部 GET /filters 回應原本也維持四陣列並排形狀，但
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
