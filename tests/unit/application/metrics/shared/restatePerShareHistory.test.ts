import { expect, test } from 'vitest';
import { restatePerShareHistory, type RestatePerShareDeps } from '@/application/metrics/shared/restatePerShareHistory';

// 假設 2026-01 面額 10→1（股數 ×10）已登記；今天市場上另有一次已除權、還沒登記的 ×basisMultiplier。
const deps = (basisMultiplier = 1): RestatePerShareDeps => ({
  shares: {
    getOutstandingCommonShares: async () => null,
    getShareSplitFactor: async (_s, from) => (from < new Date('2026-01-01') ? 10 : 1),
    getShareBasisEvents: async () => ({ basisMultiplier, events: [] }),
  },
});
const entry = (fiscalYear: number, fiscalQuarter: number | null, value: number | null, knowledgeDate = '2026-03-31', knowledgeDateIsFallback = false) => ({ fiscalYear, fiscalQuarter, value, knowledgeDate, knowledgeDateIsFallback });

test('季資料：期末在分割前的換算成分割後的每股數字，分割後的不動', async () => {
  const r = await restatePerShareHistory('7780', 'eps', 'Q', [entry(2025, 4, 4.17), entry(2026, 1, 0.13)], deps());
  expect(r.map((e) => e.value)).toEqual([0.42, 0.13]);
});

test('年報 FY（IAS 33.64 期後分割已重編）從公告日起算：公告在分割後就不再換算（7780 2025 年報 0.51）', async () => {
  const r = await restatePerShareHistory('7780', 'eps', 'FY', [entry(2025, 4, 0.51, '2026-03-31'), entry(2024, 4, 5.1, '2025-03-31')], deps());
  expect(r.map((e) => e.value)).toEqual([0.51, 0.51]);
});

test('今天已除權、還沒登記的配股也換算（6669 2026-09-02 ×2.98）', async () => {
  const r = await restatePerShareHistory('6669', 'bvps', 'Q', [entry(2026, 2, 754)], deps(2.98));
  expect(r[0]!.value).toBeCloseTo(253.02);
});

test('不是每股數字（比率、總額、股價）與 null 值原樣回傳', async () => {
  const q = [entry(2025, 4, 30.5), entry(2025, 3, null)];
  expect(await restatePerShareHistory('7780', 'roe', 'Q', q, deps())).toBe(q);
  expect(await restatePerShareHistory('7780', 'stockPrice', 'Q', q, deps())).toBe(q);
  expect((await restatePerShareHistory('7780', 'eps', 'Q', q, deps()))[1]!.value).toBeNull();
});

test('年報公告日查無（期末頂替）→ 用隔年 3/31 起算，不會把已重編的年報再換算一次', async () => {
  const r = await restatePerShareHistory('7780', 'eps', 'FY', [entry(2025, 4, 0.51, '2025-12-31', true)], deps());
  expect(r[0]!.value).toBe(0.51);
});
