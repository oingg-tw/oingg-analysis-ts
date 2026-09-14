import { readdirSync, statSync } from 'fs';
import { join } from 'path';
import { metricDefinitionRegistry } from '@/domainPitMetrics/metricDefinitionRegistry';
import { validTimeframesForMetric } from '@/api/bff/screener/fieldResolver';
import { PILOT_PROVENANCE_METRIC_CODES } from '@/domainPitMetrics/shared/provenance/provenanceTypes';
import { getBadgeForMetric } from '@/domainPitMetrics/badgeRegistry';
import type { MetricBadge } from '@/domainPitMetrics/metricDefinitionSpec';

// 2026-09-08 取代舊架構的 filterCatalog.csv（手動維護、退場前已經跟 domainPitMetrics 完全
// 脫節）——這份改成直接掃描 src/domainPitMetrics/<分類>/<指標>/ 資料夾結構（2026-09-08
// 那批拆分之後，
// 每個資料夾都嚴格對應一個獨立 metricCode，見 abstract-crafting-journal.md），比對
// metricDefinitionRegistry.ts 取得每個 metricCode 實際支援的 timeframe 清單，組出分類清單。
//
// 用 process.cwd() 而不是 import.meta.url + __dirname，理由跟 filterCatalogCheck.ts（已退場）
// 當初的說明一致：正式環境 build 產物是 CommonJS，import.meta 在那個模式下是編譯期錯誤；
// process.cwd() 兩邊都能動，前提是進場點永遠從專案根目錄啟動（Dockerfile 的 runtime 階段
// 有把 src/ 一併複製進 image，不是只有 build 產物 dist/，見 Dockerfile 的說明——swagger-jsdoc
// 本來就靠這個前提在執行期讀 .ts 原始檔解析 JSDoc，這裡是同一個前提的第二個消費者）。
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
const PIT_METRICS_ROOT = join(process.cwd(), 'src', 'domainPitMetrics');

// 2026-09-09 web-nuxt 回報：指標本身已經有 displayName，但分類這一層完全沒有中文（前端只能
// 顯示 categoryKey 這種英文字串當資料夾名稱，跟旁邊指標的中文名稱並排很突兀）。這裡補上
// categoryDisplayName，直接跟 CATEGORY_DIR_NAMES 用同一個物件宣告，避免兩份清單各自維護
// 卻漏改其中一份的風險。
const CATEGORIES: { key: string; displayName: string }[] = [
  { key: 'valuation', displayName: '市場評價' },
  { key: 'dividend', displayName: '股東政策' },
  { key: 'resilience', displayName: '財務韌性' },
  { key: 'quality', displayName: '獲利品質' },
  { key: 'profitability', displayName: '獲利能力' },
  { key: 'efficiency', displayName: '營運效率' },
  { key: 'growth', displayName: '成長動能' },
];

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
}

export interface MetricFolderCatalogCategory {
  categoryKey: string;
  categoryDisplayName: string;
  metrics: MetricFolderCatalogEntry[];
}

const listSubdirectoryNames = (dir: string): string[] => {
  try {
    return readdirSync(dir).filter((name) => statSync(join(dir, name)).isDirectory());
  } catch {
    // 分類資料夾不存在（理論上不該發生，CATEGORY_DIR_NAMES 是硬寫死對照現有資料夾結構）——
    // 優雅降級成空清單，不讓整個 GET /metrics 因為單一分類的路徑問題而掛掉。
    return [];
  }
};

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
  CATEGORIES.map(({ key: categoryKey, displayName: categoryDisplayName }) => {
    const metrics = listSubdirectoryNames(join(PIT_METRICS_ROOT, categoryKey))
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
        };
      });
    return { categoryKey, categoryDisplayName, metrics };
  }).filter((category) => category.metrics.length > 0);
