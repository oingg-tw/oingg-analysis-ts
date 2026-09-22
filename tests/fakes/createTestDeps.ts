import type { AppDeps } from '@/application/deps';
import type { LoggerPort } from '@/application/ports/logger';
import { createTestPitDeps } from './pit/createTestPitDeps';

// application use case（HTTP 那一層的 use case：stocks/companies/screener/market…）單元測試用的整份 AppDeps：
// 指標核心的部分沿用 createTestPitDeps（metricValues 記憶體版、definitions 真實 registry、其餘 port 一碰就丟錯），
// HTTP use case 用的 port 預設同樣是「一碰就丟錯」的 stub——測試只覆寫自己需要的 port（通常是幾個 async 函式的
// 物件字面值），漏 seed 的依賴會立刻被抓到，不會靜默回 null。logger 預設靜音。
const unusedPort = <T extends object>(name: keyof AppDeps): T =>
  new Proxy({} as T, {
    get: (_target, method) => () => {
      throw new Error(`測試沒有提供 deps.${String(name)}.${String(method)}——這支 use case 用到了測試沒預期的 port，請在 createTestDeps 的 overrides 補上。`);
    },
  });

export const silentLogger: LoggerPort = { info: () => {}, warn: () => {}, error: () => {} };

export const createTestDeps = (overrides: Partial<AppDeps> = {}): AppDeps => ({
  ...createTestPitDeps(),
  logger: silentLogger,
  macroData: unusedPort('macroData'),
  macroSeries: unusedPort('macroSeries'),
  companyProfiles: unusedPort('companyProfiles'),
  metricValueQueries: unusedPort('metricValueQueries'),
  preferredStocks: unusedPort('preferredStocks'),
  industryReference: unusedPort('industryReference'),
  capitalStockHistory: unusedPort('capitalStockHistory'),
  monthlyRevenue: unusedPort('monthlyRevenue'),
  statementRows: unusedPort('statementRows'),
  valuationRanking: unusedPort('valuationRanking'),
  marketLists: unusedPort('marketLists'),
  priceChange: unusedPort('priceChange'),
  taiexIndex: unusedPort('taiexIndex'),
  materialAnnouncements: unusedPort('materialAnnouncements'),
  etfData: unusedPort('etfData'),
  // 口徑解析預設回 '2'（合併報表）而不是一碰就丟錯：幾乎每個讀取端 use case 都會經過它，測試不該每支都要 seed。
  reportAvailability: { resolveDataType: async () => '2' },
  ...overrides,
});
