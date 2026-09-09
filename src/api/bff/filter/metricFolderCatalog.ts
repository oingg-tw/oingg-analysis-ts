import { readdirSync, statSync } from 'fs';
import { join } from 'path';
import { metricDefinitionRegistry, legacyAllowedArrays } from '@/pitMetrics/metricDefinitionRegistry';
import { validTokensForMetric } from '@/api/bff/screener/fieldResolver';
import type { PeriodType, LookbackRange, SamplingInterval, SnapshotCadence } from '@/pitMetrics/metricBasis';

// 2026-09-08 取代舊架構的 filterCatalog.csv（手動維護、退場前已經跟 pitMetrics 完全脫節）
// ——這份改成直接掃描 src/pitMetrics/<分類>/<指標>/ 資料夾結構（2026-09-08 那批拆分之後，
// 每個資料夾都嚴格對應一個獨立 metricCode，見 abstract-crafting-journal.md），比對
// metricDefinitionRegistry.ts 取得每個 metricCode 實際支援的四組 basis 相關欄位值
// （periodType/lookbackRange/samplingInterval/snapshotCadence，見 metricBasis.ts 的
// 完整說明），組出分類清單。
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
// 出現在 metricDefinitionRegistry 裡——這樣「一次查詢拆多個 metric_code」的編排資料夾
// （turnoverRatio/margins/bankAssetQuality/bankCapitalAdequacy/cashFlowPerShare/
// liquidityRatio，資料夾名稱本身都不是 metricCode）會被自然濾掉，不用額外維護排除清單。
const PIT_METRICS_ROOT = join(process.cwd(), 'src', 'pitMetrics');
const CATEGORY_DIR_NAMES = ['dividend', 'efficiency', 'growth', 'profitability', 'quality', 'resilience', 'valuation'];

export interface MetricFolderCatalogEntry {
  metricCode: string;
  // 2026-09-09 新增：給前端顯示用的中文名稱/單位，來源是 metricDefinitionRegistry.ts
  // 每個 metricCode 宣告的 displayName/unit——之前這支端點只有 metricCode 跟四個
  // allowedXxx 陣列，前端組欄位選單時沒有可讀文案可以用。
  displayName: string;
  unit: string;
  allowedPeriodTypes: PeriodType[];
  allowedLookbackRanges: LookbackRange[];
  allowedSamplingIntervals: SamplingInterval[];
  allowedSnapshotCadences: SnapshotCadence[];
  // 2026-09-08 bff-ts 回報：上面 allowedLookbackRanges x allowedSamplingIntervals 不是自由
  // 交叉組合（beta 9 種組合只有 3 種真的有資料），直接拿兩個陣列做笛卡兒積會做出「選了也
  // 永遠查不到資料」的假選項。這個欄位是唯一該信任的合法 token 清單，呼叫端（screener
  // field 的 "." 後半段、companies 端點的 token query 參數）直接拿來當選單使用，不用自己
  // 組合、不用知道背後是哪一組（periodType/滾動統計量/snapshotCadence）。
  validTokens: string[];
}

export interface MetricFolderCatalogCategory {
  categoryKey: string;
  metrics: MetricFolderCatalogEntry[];
}

const listSubdirectoryNames = (dir: string): string[] => {
  try {
    return readdirSync(dir).filter((name) => statSync(join(dir, name)).isDirectory());
  } catch {
    // 分類資料夾不存在（理論上不該發生，CATEGORY_DIR_NAMES 是硬寫死對照現有資料夾結構）——
    // 優雅降級成空清單，不讓整個 GET /filters 因為單一分類的路徑問題而掛掉。
    return [];
  }
};

export const scanMetricFolderCatalog = (): MetricFolderCatalogCategory[] =>
  CATEGORY_DIR_NAMES.map((categoryKey) => {
    const metrics = listSubdirectoryNames(join(PIT_METRICS_ROOT, categoryKey))
      .filter((folderName) => folderName in metricDefinitionRegistry)
      .sort()
      .map((metricCode): MetricFolderCatalogEntry => {
        const definition = metricDefinitionRegistry[metricCode]!;
        // legacyAllowedArrays() 也回傳 allowedRollingWindowTokens（registry 內部用的
        // token 白名單），刻意只解構外部回應形狀本來就有的四個欄位，不要整包 spread
        // 進去——這個外部回應形狀從 2026-09-08 起就不含 allowedRollingWindowTokens，
        // 拆 discriminated union 那次曾經不小心把它 spread 漏進來，已修正。
        const { allowedPeriodTypes, allowedLookbackRanges, allowedSamplingIntervals, allowedSnapshotCadences } = legacyAllowedArrays(definition);
        return {
          metricCode,
          displayName: definition.displayName,
          unit: definition.unit,
          allowedPeriodTypes,
          allowedLookbackRanges,
          allowedSamplingIntervals,
          allowedSnapshotCadences,
          validTokens: validTokensForMetric(metricCode),
        };
      });
    return { categoryKey, metrics };
  }).filter((category) => category.metrics.length > 0);
