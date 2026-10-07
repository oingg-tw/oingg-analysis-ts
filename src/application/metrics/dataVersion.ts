import { createHash } from 'node:crypto';
import type { AppDeps } from '@/application/deps';
import { scanMetricFolderCatalog } from '@/application/metrics/metricFolderCatalog';

// 2026-10-08 GET /data-version（API 最佳實務第一批，bff-ts 與 web-nuxt 都要）：讓下游把版本放進快取鍵，重算後自然失效，
// 不再靠我們發人工「清快取」通知；bff 也能改成便宜地輪詢 catalog 版本，取代「只在啟動時同步指標目錄」。
// - metrics[code]：該指標在三張值表最後一次寫入或更新的時間（computed_at 最大值，ISO 字串）。重算即使值沒變，只要有寫入就會變
//   （264dd0d6 起 update 也會更新 computed_at）——寧可多失效一次，也不要漏掉修正後的值（web-nuxt：「formulaVersion 沒變不代表值沒變」）。
// - catalog：GET /metrics 回應內容的雜湊，文案、單位、timeframe 任何改動都會變。
// - global：所有指標版本的最大值。
export interface DataVersion {
  global: string | null;
  catalog: string;
  metrics: Record<string, string>;
}

export const buildDataVersion = (latest: { metricCode: string; computedAt: Date }[], catalogJson: string): DataVersion => {
  const metrics: Record<string, string> = {};
  let global: Date | null = null;
  for (const { metricCode, computedAt } of latest) {
    metrics[metricCode] = computedAt.toISOString();
    if (!global || computedAt > global) global = computedAt;
  }
  return { global: global?.toISOString() ?? null, catalog: createHash('sha256').update(catalogJson).digest('hex').slice(0, 16), metrics };
};

// 背景更新的快取：每次請求直接回上一次的結果，超過 60 秒就在背景重算（不等）。只有每個執行個體的第一個請求要等查詢（約 3 秒）。
// ponytail: 每個執行個體各自一份，多個執行個體之間最多差 60 秒；重算後要更即時再改成寫入時主動更新。
const REFRESH_MS = 60_000;
let cached: { value: DataVersion; fetchedAt: number } | null = null;
let inflight: Promise<DataVersion> | null = null;

const refresh = (deps: Pick<AppDeps, 'metricValueQueries'>): Promise<DataVersion> => {
  inflight ??= deps.metricValueQueries
    .listLatestComputedAtByMetric()
    .then((latest) => {
      const value = buildDataVersion(latest, JSON.stringify(scanMetricFolderCatalog()));
      cached = { value, fetchedAt: Date.now() };
      return value;
    })
    .finally(() => {
      inflight = null;
    });
  return inflight;
};

export const getDataVersion = async (deps: Pick<AppDeps, 'metricValueQueries'>): Promise<DataVersion> => {
  if (!cached) return refresh(deps);
  if (Date.now() - cached.fetchedAt > REFRESH_MS) void refresh(deps).catch(() => undefined); // 背景更新失敗就繼續用舊值，下次請求再試
  return cached.value;
};
