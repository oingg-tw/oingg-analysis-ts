import type { PitDeps } from '@/application/metrics/deps';
import { metricDefinitionRegistry } from '@/application/metrics/metricDefinitionRegistry';
import { createInMemoryMetricValues, type InMemoryMetricValues } from './inMemoryMetricValues';

// 2026-09-17 Phase 5：指標核心的「錄製／回放」cassette。
//
// 60 支指標整合測試釘的是真實公司的真實數字（2330 115Q2 的 ROE = 10.98 之類），改成單元測試時不能靠
// 手工 seed 假資料重現（每支指標要餵的財報科目不一樣、有的還要股價序列/股本異動/公告日），所以改成
// VCR 式的做法：tests/fixtures/pit/capture.ts 用真實的 pitDeps 跑一次同樣的 compute 呼叫，把每個 port
// 方法的（參數 → 回傳值）錄進 tests/fixtures/pit/<測試名>.json；單元測試用 createReplayPitDeps 回放，
// 任何沒錄到的呼叫直接丟錯（不會靜默回 null），跟 createTestPitDeps 的 unusedPort 同一個精神。
//
// metricValues（寫入端）跟 definitions 不錄——回放時用記憶體版 repository + 真實的靜態 registry，
// 這樣「第二次重跑 skipped_unchanged」「重複寫入不疊加」這類 persist 行為在單元測試裡一樣成立。
//
// JSON 編碼：Date / bigint / Map / Set / Decimal（Prisma 的 Decimal 物件）/ undefined 都有各自的標記，
// 回放時還原成同型別（Decimal 還原成字串——呼叫端一律用 Number() 轉，跟 Decimal 物件的 valueOf 行為一致）。

export const RECORDED_PORTS = ['statements', 'annualReports', 'quarters', 'announcements', 'shares', 'market', 'xbrlAccounts', 'industry', 'dividendEvents', 'priceLevel', 'monthlyRevenue'] as const;
export type RecordedPort = (typeof RECORDED_PORTS)[number];

export interface Cassette {
  recordedAt: string;
  entries: Record<string, unknown>; // callKey → 編碼後的回傳值
}

type Tagged = { $date: string } | { $bigint: string } | { $decimal: string } | { $map: [unknown, unknown][] } | { $set: unknown[] } | { $undefined: true };

const isDecimalLike = (value: object): value is { toString(): string } =>
  typeof (value as { toFixed?: unknown }).toFixed === 'function' && typeof (value as { toNumber?: unknown }).toNumber === 'function';

export const encodeValue = (value: unknown): unknown => {
  if (value === undefined) return { $undefined: true } satisfies Tagged;
  if (value === null || typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') return value;
  if (typeof value === 'bigint') return { $bigint: value.toString() } satisfies Tagged;
  if (value instanceof Date) return { $date: value.toISOString() } satisfies Tagged;
  if (value instanceof Map) return { $map: [...value.entries()].map(([k, v]) => [encodeValue(k), encodeValue(v)] as [unknown, unknown]) } satisfies Tagged;
  if (value instanceof Set) return { $set: [...value].map(encodeValue) } satisfies Tagged;
  if (Array.isArray(value)) return value.map(encodeValue);
  if (typeof value === 'object') {
    if (isDecimalLike(value)) return { $decimal: value.toString() } satisfies Tagged;
    const out: Record<string, unknown> = {};
    for (const key of Object.keys(value).sort()) out[key] = encodeValue((value as Record<string, unknown>)[key]);
    return out;
  }
  throw new Error(`cassette 無法編碼的值型別：${typeof value}`);
};

export const decodeValue = (value: unknown): unknown => {
  if (value === null || typeof value !== 'object') return value;
  if (Array.isArray(value)) return value.map(decodeValue);
  const obj = value as Record<string, unknown>;
  if ('$undefined' in obj) return undefined;
  if ('$bigint' in obj) return BigInt(obj.$bigint as string);
  if ('$date' in obj) return new Date(obj.$date as string);
  if ('$decimal' in obj) return obj.$decimal as string;
  if ('$map' in obj) return new Map((obj.$map as [unknown, unknown][]).map(([k, v]) => [decodeValue(k), decodeValue(v)]));
  if ('$set' in obj) return new Set((obj.$set as unknown[]).map(decodeValue));
  const out: Record<string, unknown> = {};
  for (const [key, inner] of Object.entries(obj)) out[key] = decodeValue(inner);
  return out;
};

// 呼叫的識別鍵：port.method(參數 JSON)——參數先經過同一套編碼（Date 之類才會穩定），物件 key 已排序。
export const callKey = (port: string, method: string, args: unknown[]): string => `${port}.${method}(${JSON.stringify(encodeValue(args))})`;

// 回放：九個資料 port（2026-09-22 加 priceLevel） 全部從 cassette 查表，metricValues 記憶體版、definitions 真實 registry。
export const createReplayPitDeps = (cassette: Cassette, overrides: Partial<PitDeps> = {}): PitDeps & { metricValues: InMemoryMetricValues } => {
  const replayPort = <T extends object>(port: RecordedPort): T =>
    new Proxy({} as T, {
      get: (_target, method) => {
        if (typeof method !== 'string') return undefined;
        return async (...args: unknown[]) => {
          const key = callKey(port, method, args);
          if (!(key in cassette.entries)) {
            throw new Error(`cassette 沒有錄到這個呼叫：${key}——請在 tests/fixtures/pit/capture.ts 補上對應的 compute/query 後重新錄製（pnpm tsx tests/fixtures/pit/capture.ts）。`);
          }
          return decodeValue(cassette.entries[key]);
        };
      },
    });

  const metricValues = (overrides.metricValues as InMemoryMetricValues | undefined) ?? createInMemoryMetricValues();
  return {
    statements: replayPort('statements'),
    annualReports: replayPort('annualReports'),
    quarters: replayPort('quarters'),
    announcements: replayPort('announcements'),
    shares: replayPort('shares'),
    market: replayPort('market'),
    xbrlAccounts: replayPort('xbrlAccounts'),
    monthlyRevenue: replayPort('monthlyRevenue'),
    industry: replayPort('industry'),
    dividendEvents: replayPort('dividendEvents'),
    priceLevel: replayPort('priceLevel'),
    definitions: { get: (metricCode) => metricDefinitionRegistry[metricCode] },
    ...overrides,
    metricValues,
  };
};

// 錄製：把真實 deps 的九個資料 port（2026-09-22 加 priceLevel） 包一層，每次呼叫都把結果寫進 entries；metricValues 換成記憶體版
// （錄製過程不寫 DB，也不需要 DB 裡既有的列）。回傳的 ports 用 Object.assign 蓋回真實的 pitDeps 物件上，
// bootstrap/pitMetrics.ts 綁好的 computeAndWriteXxxPit 就會走錄製版（它們拿的是同一個物件參照）。
export const createRecordingPorts = (real: PitDeps): { ports: Partial<PitDeps>; entries: Record<string, unknown> } => {
  const entries: Record<string, unknown> = {};
  const recordPort = <T extends object>(port: RecordedPort, target: T): T =>
    new Proxy(target, {
      get: (obj, method, receiver) => {
        const original = Reflect.get(obj, method, receiver);
        if (typeof original !== 'function' || typeof method !== 'string') return original;
        return async (...args: unknown[]) => {
          const result = await (original as (...a: unknown[]) => unknown).apply(obj, args);
          entries[callKey(port, method, args)] = encodeValue(result);
          return result;
        };
      },
    });

  const ports: Partial<PitDeps> = { metricValues: createInMemoryMetricValues() };
  for (const port of RECORDED_PORTS) {
    (ports as Record<string, unknown>)[port] = recordPort(port, real[port] as object);
  }
  return { ports, entries };
};
