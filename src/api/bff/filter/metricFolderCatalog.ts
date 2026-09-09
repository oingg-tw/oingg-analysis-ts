import { readdirSync, statSync } from 'fs';
import { join } from 'path';
import { metricDefinitionRegistry } from '@/pitMetrics/metricDefinitionRegistry';
import { validTokensForMetric } from '@/api/bff/screener/fieldResolver';

// 2026-09-08 取代舊架構的 filterCatalog.csv（手動維護、退場前已經跟 pitMetrics 完全脫節）
// ——這份改成直接掃描 src/pitMetrics/<分類>/<指標>/ 資料夾結構（2026-09-08 那批拆分之後，
// 每個資料夾都嚴格對應一個獨立 metricCode，見 abstract-crafting-journal.md），比對
// metricDefinitionRegistry.ts 取得每個 metricCode 實際支援的 token 清單，組出分類清單。
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
  // 每個 metricCode 宣告的 displayName/unit。
  displayName: string;
  unit: string;
  // 2026-09-08 新增，2026-09-09 起是這個端點唯一曝露的 token 相關欄位——原本還有四個
  // allowedXxx 陣列並排（allowedPeriodTypes/allowedLookbackRanges/
  // allowedSamplingIntervals/allowedSnapshotCadences），但 bff-ts 早在拿到 validTokens
  // 之後就已經完全改讀這個欄位、不再碰那四個陣列（笛卡兒積會做出查不到資料的假選項，
  // 見 fieldResolver.ts 的說明）——既然沒有任何消費端還在用，直接移除四陣列並排的外部
  // 回應形狀，只留這個唯一該信任的合法 token 清單。呼叫端（screener field 的 "."
  // 後半段、companies 端點的 token query 參數）直接拿來當選單使用。
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
        return {
          metricCode,
          displayName: definition.displayName,
          unit: definition.unit,
          validTokens: validTokensForMetric(metricCode),
        };
      });
    return { categoryKey, metrics };
  }).filter((category) => category.metrics.length > 0);
