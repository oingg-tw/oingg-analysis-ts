import { metricDefinitionRegistry } from '@/application/metrics/metricDefinitionRegistry';
import { validTimeframesForMetric } from './resolveTimeframeForMetric';
import { PILOT_PROVENANCE_METRIC_CODES } from '@/application/metrics/shared/provenance/provenanceTypes';
import { getBadgeForMetric } from '@/domain/metrics/badgeRegistry';
import { METRIC_CATEGORIES } from '@/domain/metrics/categories';
import { METRIC_FOLDER_INDEX } from '@/domain/metrics/folderIndex';
import { getMetricNarrative } from '@/domain/metrics/metricNarratives';
import type { MetricBadge } from '@/domain/metrics/metricDefinitionSpec';

// 2026-09-08 取代舊架構的 filterCatalog.csv（手動維護、退場前已經跟 domainPitMetrics 完全
// 脫節）——這份改成以 src/domain/metrics/<分類>/<指標>/ 資料夾結構為準（2026-09-08
// 那批拆分之後，每個資料夾都嚴格對應一個獨立 metricCode，見 abstract-crafting-journal.md），
// 比對 metricDefinitionRegistry.ts 取得每個 metricCode 實際支援的 timeframe 清單，組出分類清單。
//
// 2026-09-17 Phase 6：資料夾清單不再在執行期 readdirSync（那個做法讓 prod image 必須帶著 src/），改讀
// build 前產生的靜態索引 src/domain/metrics/folderIndex.ts（scripts/codemods/generateMetricFolderIndex.ts），
// tests/unit/domain/metrics/folderIndex.test.ts 在測試期比對索引跟實際資料夾——「掃資料夾」從執行期搬到測試期。
//
// 刻意排除的兩個分類：`shared/`（dupont/marketRatios 這兩個資料夾底下放的是「一次查詢、
// 拆多個 metric_code」的編排邏輯，資料夾名稱本身不是 metricCode，過濾條件自然排除）、
// `chip/`（空殼分類，目前沒有任何指標遷入，見該資料夾的 README.md）。判斷一個子資料夾
// 是不是「真正的獨立指標」，不是靠白名單／黑名單資料夾名稱，是直接比對資料夾名稱有沒有
// 出現在 metricDefinitionRegistry 裡（或有 metricCode 宣告 folderName 指向它，見下方
// metricCodesForFolder()/metricDefinitionSpec.ts 的完整說明）——這樣「一次查詢拆多個
// metric_code」的編排資料夾（turnoverRatio/margins/bankAssetQuality/bankCapitalAdequacy/
// cashFlowPerShare/liquidityRatio，資料夾名稱本身都不是 metricCode，也沒有任何 metricCode
// 宣告 folderName 指向它們）會被自然濾掉，不用額外維護排除清單。
//
// 分類的 key/中文名稱（categoryDisplayName，2026-09-09 應 web-nuxt 要求補上）在 domain/metrics/categories.ts
// 同一份宣告，順序即回應順序。

export interface MetricFolderCatalogEntry {
  metricCode: string;
  // 2026-09-09 新增，2026-09-12 改名（displayName→name）：給前端顯示用的中文名稱/單位，
  // 來源是 metricDefinitionRegistry.ts 每個 metricCode 宣告的 name/unit，跟
  // MetricBadge 共用同一組 NamedEntity 欄位命名，見 metricDefinitionSpec.ts 的說明。
  name: string;
  // 2026-09-11 新增，2026-09-12 改名（displayNameSuffix→nameSuffix）：跟 name 平行的
  // 補充資訊（例如「即時」），不要塞進 name 本身的括號附註——見 metricDefinitionSpec.ts
  // 的完整說明。選填，沒有補充資訊時是 undefined。
  nameSuffix?: string;
  // 2026-09-12 新增：英文名稱，目前只有原本 15 支大師徽章指標有值，其餘 79 支還沒補，
  // 選填，沒有時是 undefined（不是空字串）。
  nameEn?: string;
  unit: string;
  // 2026-09-08 新增，2026-09-09 起是這個端點唯一曝露的 timeframe 相關欄位——原本還有四個
  // allowedXxx 陣列並排（allowedPeriodTypes/allowedLookbackRanges/
  // allowedSamplingIntervals/allowedSnapshotCadences），但 bff-ts 早在拿到 validTimeframes
  // 之後就已經完全改讀這個欄位、不再碰那四個陣列（笛卡兒積會做出查不到資料的假選項，
  // 見 fieldResolver.ts 的說明）——既然沒有任何消費端還在用，直接移除四陣列並排的外部
  // 回應形狀，只留這個唯一該信任的合法 timeframe 清單。呼叫端（screener field 的 "."
  // 後半段、companies 端點的 timeframe query 參數）直接拿來當選單使用。
  validTimeframes: string[];
  // 2026-09-10 新增：前後端統一算式顯示——使用者要求公式本身由後端儲存，前端忠實顯示，
  // 不要各自維護一份跟後端實際計算對不上的算式。LaTeX 字串，用 @cortex-js/compute-engine
  // 驗證過語法（見 scripts/validateFormulaLatex.ts），建議前端用同一個套件家族的
  // mathlive（唯讀模式）或純 KaTeX 渲染。目前只在少數指標試點，還沒補上的是 undefined
  // （不是空字串），前端要處理「這支指標還沒有公式可顯示」的情況，繼續 fallback 顯示
  // displayName 就好。
  formulaLatex?: string;
  // 2026-09-10 新增：出處來源，維護者跟前端終端使用者都要能看，都是公開可點的超連結
  // （見 metricDefinitionSpec.ts 的完整說明）。academicSourceUrl 只有真的有單一可指名
  // 論文出處的大師模型/複合指標才填，一般會計比率沒有這個欄位；referenceUrl 是給終端
  // 使用者查證定義用的公開參考頁面（Investopedia/Wikipedia 這類），大師模型也可能兩個
  // 都填。兩者都選填，還沒補上的是 undefined（不是空字串）。
  academicSourceUrl?: string;
  referenceUrl?: string;
  // 2026-09-10 新增：三層計算複雜度分層（見 metricDefinitionSpec.ts 的完整說明），跟
  // categoryKey（因子主題分類）正交——'raw' 是完全不計算的 passthrough、'derived' 是
  // 基本財報數字的單一比率、'composite' 是多因子模型/統計方法論。必填，不會是 undefined。
  tier: 'raw' | 'derived' | 'composite';
  // 2026-09-10 新增：這支指標實際依賴的真實資料來源，見 metricDefinitionSpec.ts 的完整
  // 說明（不是從 dependsOn 推導，那個欄位沒有執行期消費者、不受強制檢查）。必填，不會是
  // undefined——每支指標一定有真實資料來源。web-nuxt 22 個前端元件原本各自手工維護 6 種
  // 資料來源標籤文字，改讀這裡統一維護。
  sources: string[];
  // 2026-09-10 新增：web-nuxt 原本在前端手工維護的「大師徽章」資料（命名法則/門檻/引用出處）
  // 搬過來，見 metricDefinitionSpec.ts 的完整說明。2026-09-14 來源改成獨立的
  // badgeRegistry.ts，不是 definition.badge（那個欄位已移除）——單純搬家，形狀不變，只有
  // 15 支指標有，其餘指標這個欄位是 undefined。
  badge?: MetricBadge;
  // 2026-09-13 新增：這支 metricCode 有沒有稽核鏈（GET /companies/:symbol/metric-provenance
  // 支援的 metricCode，見 provenanceTypes.ts 的 PILOT_PROVENANCE_METRIC_CODES）——原本
  // 前端完全沒有管道知道哪些指標支援稽核鏈，只能猜測或另外手工維護一份清單（會跟這裡
  // 逐批擴大的進度脫節，例如新增 payablesTurnover 支援後，沒讀這個欄位的呼叫端不會
  // 自動生效）。必填，不會是 undefined。
  hasProvenance: boolean;
  // 2026-09-19 新增：給終端使用者看的三段說明文字（web-nuxt /metrics/{code} SEO 頁），來源是
  // domain/metrics/metricNarratives.ts 獨立登錄檔（不在 Definition 裡，理由同 badgeRegistry）。三個一起有或
  // 一起沒有；第一批只補 35 支有徽章的指標，其餘是 undefined（不是空字串）。措辭只陳述定義／限制／誤讀，
  // 不下投資結論。
  description?: string;
  limitations?: string;
  misreadings?: string;
}

export interface MetricFolderCatalogCategory {
  categoryKey: string;
  categoryDisplayName: string;
  metrics: MetricFolderCatalogEntry[];
}

// 2026-09-14 新增：epsCagr/revenueCagr/dividendGrowthRate 這三個「家族」資料夾各自用一個
// buildDefinition(years) 從同一個資料夾產生多個 metricCode（例如 epsCagr3y/5y/8y 全部放在
// growth/epsCagr/ 底下），靠 registry 裡的 folderName 欄位（見 metricDefinitionSpec.ts 的
// 完整說明）反查回這個資料夾底下實際有哪些 metricCode——一般 1:1 的指標沒有宣告 folderName，
// fallback 成資料夾名稱本身當 metricCode（維持原本行為不變）。
const metricCodesForFolder = (folderName: string): string[] => {
  if (folderName in metricDefinitionRegistry) return [folderName];
  return Object.keys(metricDefinitionRegistry).filter((code) => metricDefinitionRegistry[code]!.folderName === folderName);
};

export const scanMetricFolderCatalog = (): MetricFolderCatalogCategory[] =>
  METRIC_CATEGORIES.map(({ key: categoryKey, displayName: categoryDisplayName }) => {
    const metrics = METRIC_FOLDER_INDEX[categoryKey]
      .flatMap(metricCodesForFolder)
      .filter((metricCode) => !metricDefinitionRegistry[metricCode]!.excludeFromFilterCatalog)
      .sort()
      .map((metricCode): MetricFolderCatalogEntry => {
        const definition = metricDefinitionRegistry[metricCode]!;
        return {
          metricCode,
          name: definition.name,
          nameSuffix: definition.nameSuffix,
          nameEn: definition.nameEn,
          unit: definition.unit,
          validTimeframes: validTimeframesForMetric(metricCode),
          formulaLatex: definition.formulaLatex,
          academicSourceUrl: definition.academicSourceUrl,
          referenceUrl: definition.referenceUrl,
          tier: definition.tier,
          sources: definition.sources,
          badge: getBadgeForMetric(metricCode),
          hasProvenance: (PILOT_PROVENANCE_METRIC_CODES as readonly string[]).includes(metricCode),
          ...getMetricNarrative(metricCode),
        };
      });
    return { categoryKey, categoryDisplayName, metrics };
  }).filter((category) => category.metrics.length > 0);
