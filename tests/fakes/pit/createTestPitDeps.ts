import type { PitDeps } from '@/application/metrics/deps';
import { metricDefinitionRegistry } from '@/application/metrics/metricDefinitionRegistry';
import { createInMemoryMetricValues } from './inMemoryMetricValues';

// 沒被測試覆寫的 port 一律是「一碰就丟錯」的 stub——比起靜默回 null，這樣能立刻抓到「這支 compute
// 用到了測試沒預期的依賴」（例如漏掉某張表的 seed）。metricValues 例外，預設給記憶體版
// （compute 本身不寫入，persistComputations 的測試才用到）；definitions 直接用真實的靜態 registry
// （純資料，137 支 definition 的 allowed* 清單就是被測的規則本身）。
const unusedPort = <T extends object>(name: keyof PitDeps): T =>
  new Proxy({} as T, {
    get: (_target, method) => () => {
      throw new Error(`測試沒有提供 deps.${String(name)}.${String(method)}——這支 compute 用到了測試沒預期的 port，請在 createTestPitDeps 的 overrides 補上。`);
    },
  });

export const createTestPitDeps = (overrides: Partial<PitDeps> = {}): PitDeps => ({
  statements: unusedPort('statements'),
  annualReports: unusedPort('annualReports'),
  quarters: unusedPort('quarters'),
  announcements: unusedPort('announcements'),
  shares: unusedPort('shares'),
  market: unusedPort('market'),
  xbrlAccounts: unusedPort('xbrlAccounts'),
  industry: unusedPort('industry'),
  dividendEvents: unusedPort('dividendEvents'),
  monthlyRevenue: unusedPort('monthlyRevenue'),
  priceLevel: unusedPort('priceLevel'),
  metricValues: createInMemoryMetricValues(),
  definitions: { get: (metricCode) => metricDefinitionRegistry[metricCode] },
  ...overrides,
});
