import { expect, test, vi } from 'vitest';

// 2026-10-11 UPSTREAM-KEY-TWSE 結尾帶 \r，掛成環境變數後跟 header 比不上（twse 推送一直 401）。config 讀環境變數時要去頭尾空白。
test('環境變數結尾的 \\r\\n 會被去掉（金鑰跟 header 比對才對得上）', async () => {
  vi.resetModules();
  vi.stubEnv('UPSTREAM_KEY_TWSE', 'abc123\r\n');
  const { config } = await import('@/infrastructure/config');
  expect(config.upstreamKeys.twse).toBe('abc123');
  vi.unstubAllEnvs();
});
