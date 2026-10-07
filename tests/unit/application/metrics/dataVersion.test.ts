import { expect, test } from 'vitest';
import { buildDataVersion } from '@/application/metrics/dataVersion';

// 2026-10-08 GET /data-version：每支指標的版本＝最後寫入時間、global＝最大值、catalog＝目錄雜湊（內容一變就變）。
test('每支指標的版本是最後寫入時間，global 取最大值', () => {
  const v = buildDataVersion(
    [
      { metricCode: 'roe', computedAt: new Date('2026-10-08T01:00:00Z') },
      { metricCode: 'sus', computedAt: new Date('2026-10-07T12:00:00Z') },
    ],
    '[]'
  );
  expect(v.metrics).toEqual({ roe: '2026-10-08T01:00:00.000Z', sus: '2026-10-07T12:00:00.000Z' });
  expect(v.global).toBe('2026-10-08T01:00:00.000Z');
});

test('目錄內容改了 catalog 版本就變；完全沒有資料時 global 為 null', () => {
  const a = buildDataVersion([], '[{"metricCode":"roe","name":"A"}]');
  const b = buildDataVersion([], '[{"metricCode":"roe","name":"B"}]');
  expect(a.catalog).not.toBe(b.catalog);
  expect(a.catalog).toMatch(/^[0-9a-f]{16}$/);
  expect(a.global).toBeNull();
});
