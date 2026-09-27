import { expect, test } from 'vitest';
import { matchDividendDeclarations, rollForwardPerShare, type ShareBasisEvent } from '@/domain/financials/liveShareBasis';

const d = (s: string) => new Date(s);
const base = { shares: 100, bvps: 50, eps: 5 };

test('現金股利季末沒認列：除息日當天才從每股淨值扣，前一天不動', () => {
  const ev: ShareBasisEvent[] = [{ kind: 'cashDividend', date: d('2026-06-22'), perShare: 10, recognizedAtBasis: false }];
  expect(rollForwardPerShare(base, ev, d('2026-06-21')).bvps).toBe(50);
  expect(rollForwardPerShare(base, ev, d('2026-06-22')).bvps).toBe(40);
});

test('7769：季末已認列（權益已扣）、除息在季末之後 → 除息前加回（股價含息），除息後回到季末數字', () => {
  const ev: ShareBasisEvent[] = [{ kind: 'cashDividend', date: d('2026-07-30'), perShare: 65, recognizedAtBasis: true }];
  expect(rollForwardPerShare({ ...base, bvps: 315 }, ev, d('2026-07-29')).bvps).toBe(380);
  expect(rollForwardPerShare({ ...base, bvps: 315 }, ev, d('2026-07-30')).bvps).toBe(315);
});

test('股票股利（每股配 1 元、面額 10 → ×1.1）：股數變多、每股淨值與 EPS 同比例稀釋；同日除息先扣現金（按舊股數）', () => {
  const ev: ShareBasisEvent[] = [
    { kind: 'shareChange', date: d('2026-10-06'), multiplier: 1.1, cashPerOldShare: 0 },
    { kind: 'cashDividend', date: d('2026-10-06'), perShare: 5, recognizedAtBasis: false },
  ];
  const r = rollForwardPerShare(base, ev, d('2026-10-06'));
  expect(r.shares).toBeCloseTo(110);
  expect(r.bvps).toBeCloseTo(45 / 1.1);
  expect(r.eps).toBeCloseTo(5 / 1.1);
});

test('退還股款減資兩成（股數 ×0.8、每舊股退 2 元）：每股淨值 = (50 − 2) ÷ 0.8；彌補虧損減資只換算股數', () => {
  expect(rollForwardPerShare(base, [{ kind: 'shareChange', date: d('2026-08-20'), multiplier: 0.8, cashPerOldShare: 2 }], d('2026-09-01')).bvps).toBeCloseTo(60);
  expect(rollForwardPerShare(base, [{ kind: 'shareChange', date: d('2026-08-20'), multiplier: 0.8, cashPerOldShare: 0 }], d('2026-09-01')).bvps).toBeCloseTo(62.5);
});

test('現金增資：只加股數（照淨值發行假設），每股淨值與 EPS 不變', () => {
  expect(rollForwardPerShare(base, [{ kind: 'issue', date: d('2026-08-01'), newShares: 20 }], d('2026-09-01'))).toEqual({ shares: 120, bvps: 50, eps: 5 });
});

test('2330 季配息：權益變動表每季差分依序配到正確的除息事件（同額 6 元兩次不會配錯）', () => {
  const t = 25_932_370; // 參與股數（千股）
  const events = [
    { exDate: d('2025-06-12'), amountThousands: 4.5 * t },
    { exDate: d('2025-09-16'), amountThousands: 5 * t },
    { exDate: d('2025-12-11'), amountThousands: 5 * t },
    { exDate: d('2026-03-17'), amountThousands: 6 * t },
    { exDate: d('2026-06-11'), amountThousands: 6 * t },
    { exDate: d('2026-09-16'), amountThousands: 7 * t },
  ];
  const declarations = [
    { quarterEnd: d('2025-03-31'), amountThousands: 116_697_300 },
    { quarterEnd: d('2025-06-30'), amountThousands: 129_663_078 },
    { quarterEnd: d('2025-09-30'), amountThousands: 129_662_913 },
    { quarterEnd: d('2025-12-31'), amountThousands: 155_595_147 },
    { quarterEnd: d('2026-03-31'), amountThousands: 155_595_147 },
    { quarterEnd: d('2026-06-30'), amountThousands: 181_526_591 },
  ];
  expect(matchDividendDeclarations(declarations, events).map((x) => x?.toISOString().slice(0, 10) ?? null)).toEqual([
    '2025-03-31', '2025-06-30', '2025-09-30', '2025-12-31', '2026-03-31', '2026-06-30',
  ]);
});

test('年度股利股東會當季就除息（6669 2026-06-22）→ 找同一季；對不到的事件回 null', () => {
  const events = [{ exDate: d('2026-06-22'), amountThousands: 26_946_914 }, { exDate: d('2026-08-01'), amountThousands: 999 }];
  expect(matchDividendDeclarations([{ quarterEnd: d('2026-06-30'), amountThousands: 26_946_914 }], events)).toEqual([d('2026-06-30'), null]);
});
