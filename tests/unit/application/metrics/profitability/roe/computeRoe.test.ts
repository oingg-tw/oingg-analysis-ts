import { describe, expect, test } from 'vitest';
import { computeRoe, resolveRoeQuarterData } from '@/application/metrics/profitability/roe/computeRoe';
import { isComputationSkip, type MetricComputation } from '@/domain/metrics/computation';
import { createInMemoryStatements, quarterEndDate, type StatementsSeed } from '../../../../../fakes/pit/inMemoryStatements';
import { createFixedAnnouncements } from '../../../../../fakes/pit/fixedAnnouncements';
import { createTestPitDeps } from '../../../../../fakes/pit/createTestPitDeps';

// Phase 3 試點：ROE 的值、TTM 的 knowledge_date 傳染、null_reason 分支全部用記憶體 port 釘住——
// 以前這些只能靠整合測試打真實資料庫、還得去找一家「剛好權益是負值」的公司才能測邊界案例。
// 真實數字（2330 115Q2 = 10.98 / 34.78）仍由 tests/pitMetrics/roePit.test.ts 的整合測試守著。

const query = { symbol: '2330', year: '115', season: '2' as const, dataType: '2' as const, subsidiaryCompanyId: '' };

// 114Q3～115Q2 四季淨利 100/200/300/400（合計 1000）；2026-09-22 起分母是平均權益（Q = 本季與上季期末兩點、
// TTM = 114Q2～115Q2 五個季末），這裡刻意讓五個季末權益 5500/4500/5000/5000/5000 平均恰好 5000、
// 最後兩點平均也是 5000 → Q = 8%、TTM = 20%，數字跟改版前一樣但走的是平均路徑。
const fourQuarters: StatementsSeed = {
  '2330': {
    '114Q2': { balance: { equityAttributableToParent: 5500n } },
    '114Q3': { income: { netIncomeAttributableToParent: 100n }, balance: { equityAttributableToParent: 4500n } },
    '114Q4': { income: { netIncomeAttributableToParent: 200n }, balance: { equityAttributableToParent: 5000n } },
    '115Q1': { income: { netIncomeAttributableToParent: 300n }, balance: { equityAttributableToParent: 5000n } },
    '115Q2': { income: { netIncomeAttributableToParent: 400n }, balance: { equityAttributableToParent: 5000n } },
  },
};

const announced = {
  '2330-114Q3': new Date('2025-11-13T00:00:00.000Z'),
  '2330-114Q4': new Date('2026-02-12T00:00:00.000Z'),
  '2330-115Q1': new Date('2026-05-14T00:00:00.000Z'),
  '2330-115Q2': new Date('2026-08-12T00:00:00.000Z'),
};

const depsFor = (seed: StatementsSeed, announcedDates: Record<string, Date> = announced) => {
  const statements = createInMemoryStatements(seed);
  return createTestPitDeps({ statements, quarters: statements, announcements: createFixedAnnouncements(announcedDates) });
};

const asComputation = (slot: MetricComputation | { action: string }): MetricComputation => {
  if (isComputationSkip(slot as never)) throw new Error(`預期是一筆計算結果，卻是 skip：${JSON.stringify(slot)}`);
  return slot as MetricComputation;
};

describe('computeRoe', () => {
  test('Q = 本季淨利 / 兩點平均權益，TTM = 四季淨利加總 / 五點平均權益；slot 順序固定 q → ttm；formulaVersion 2', async () => {
    const batch = await computeRoe(query, depsFor(fourQuarters));

    expect(batch).toMatchObject({ symbol: '2330', rocYear: '115', season: '2' });
    expect(Object.keys(batch.slots)).toEqual(['q', 'ttm']);

    const q = asComputation(batch.slots.q);
    expect(q).toMatchObject({ metricCode: 'roe', periodType: 'Q', lookbackRange: 'N/A', samplingInterval: 'N/A', snapshotCadence: 'N/A', fiscalYear: 2026, fiscalQuarter: 2, dataType: '2', subsidiaryCompanyId: '' });
    expect(q.value).toBe(8);
    expect(q.nullReason).toBeNull();
    expect(q.knowledgeDate).toEqual(announced['2330-115Q2']);
    expect(q.knowledgeDateIsFallback).toBe(false);

    const ttm = asComputation(batch.slots.ttm);
    expect(ttm.periodType).toBe('TTM');
    expect(ttm.value).toBe(20);
    expect(ttm.nullReason).toBeNull();
    expect(q.formulaVersion).toBe(2);
    expect(ttm.formulaVersion).toBe(2);
  });

  test('平均分母真的有平均：上季期末 3000、本季 5000 → Q 分母 4000', async () => {
    const seed: StatementsSeed = {
      '2330': {
        '115Q1': { balance: { equityAttributableToParent: 3000n } },
        '115Q2': { income: { netIncomeAttributableToParent: 400n }, balance: { equityAttributableToParent: 5000n } },
      },
    };
    expect(asComputation((await computeRoe(query, depsFor(seed))).slots.q).value).toBe(10);
  });

  test('缺上季資產負債表 → Q 寫 insufficient_history（本季權益有，只是平均湊不齊）', async () => {
    const seed: StatementsSeed = { '2330': { '115Q2': { income: { netIncomeAttributableToParent: 400n }, balance: { equityAttributableToParent: 5000n } } } };
    expect(asComputation((await computeRoe(query, depsFor(seed))).slots.q)).toMatchObject({ value: null, nullReason: 'insufficient_history' });
  });

  test('TTM 的 knowledge_date = 四季公告日的最大值；任一季退回期末日就標 isFallback', async () => {
    // 114Q3 沒有公告日 → 該季退回期末日 2025-09-30，但最大值仍是 115Q2 的公告日；整體標 fallback。
    const { '2330-114Q3': _dropped, ...withoutQ3 } = announced;
    const batch = await computeRoe(query, depsFor(fourQuarters, withoutQ3));

    const ttm = asComputation(batch.slots.ttm);
    expect(ttm.knowledgeDate).toEqual(announced['2330-115Q2']);
    expect(ttm.knowledgeDateIsFallback).toBe(true);
    // Q 只看本季，本季有公告日，不受影響。
    expect(asComputation(batch.slots.q).knowledgeDateIsFallback).toBe(false);
  });

  test('權益為負仍算出真實（可能扭曲的）負值，不隱藏成 null', async () => {
    const seed: StatementsSeed = { '2330': { '115Q1': { balance: { equityAttributableToParent: -500n } }, '115Q2': { income: { netIncomeAttributableToParent: 100n }, balance: { equityAttributableToParent: -500n } } } };
    const resolution = await resolveRoeQuarterData(query, depsFor(seed));

    expect(resolution).not.toBeNull();
    expect(resolution!.netIncome.value).toBe(100n);
    expect(resolution!.equity.value).toBe(-500n);
    expect(resolution!.roeQuarterlyPct).toBe(-20);
    expect(resolution!.quarterlyNullReason).toBeNull();
  });

  test('權益為 0 → zero_or_negative_denominator；淨利缺 → missing_input', async () => {
    const zeroEquity = await computeRoe(query, depsFor({ '2330': { '115Q1': { balance: { equityAttributableToParent: 0n } }, '115Q2': { income: { netIncomeAttributableToParent: 100n }, balance: { equityAttributableToParent: 0n } } } }));
    expect(asComputation(zeroEquity.slots.q)).toMatchObject({ value: null, nullReason: 'zero_or_negative_denominator' });

    const noIncome = await computeRoe(query, depsFor({ '2330': { '115Q1': { balance: { equityAttributableToParent: 5000n } }, '115Q2': { income: {}, balance: { equityAttributableToParent: 5000n } } } }));
    expect(asComputation(noIncome.slots.q)).toMatchObject({ value: null, nullReason: 'missing_input' });
  });

  test('四季不齊 → TTM 寫 insufficient_history，knowledge_date 沿用本季（Q）的 anchor', async () => {
    const twoQuarters: StatementsSeed = {
      '2330': {
        '115Q1': { income: { netIncomeAttributableToParent: 300n }, balance: { equityAttributableToParent: 5000n } },
        '115Q2': { income: { netIncomeAttributableToParent: 400n }, balance: { equityAttributableToParent: 5000n } },
      },
    };
    const batch = await computeRoe(query, depsFor(twoQuarters));

    expect(asComputation(batch.slots.q).value).toBe(8);
    const ttm = asComputation(batch.slots.ttm);
    expect(ttm).toMatchObject({ periodType: 'TTM', value: null, nullReason: 'insufficient_history' });
    expect(ttm.knowledgeDate).toEqual(announced['2330-115Q2']);
  });

  test('本季連期末日都查不到（公告日 port 回 null）→ 兩個 basis 都 skipped_no_knowledge_date', async () => {
    const statements = createInMemoryStatements(fourQuarters);
    const noAnchor = createTestPitDeps({
      statements,
      quarters: statements,
      announcements: { getPriceAnchorDate: async () => null },
    });
    const batch = await computeRoe(query, noAnchor);

    expect(batch.slots.q).toEqual({ action: 'skipped_no_knowledge_date' });
    expect(batch.slots.ttm).toEqual({ action: 'skipped_no_knowledge_date' });
  });

  test('沒指定 year/season 時透過 quarters port 抓「資產負債表跟損益表都有資料」的最新一季', async () => {
    const batch = await computeRoe({ symbol: '2330', dataType: '2', subsidiaryCompanyId: '' }, depsFor(fourQuarters));

    // 114Q2 只有資產負債表，其餘四季兩張表都有 → 交集的最新一季是 115Q2。
    expect(batch).toMatchObject({ rocYear: '115', season: '2' });
    expect(asComputation(batch.slots.q).value).toBe(8);
  });

  test('查無任何一季 → 整批 skipped_no_quarter，不碰財報/公告日 port', async () => {
    const batch = await computeRoe({ symbol: '9999', dataType: '2', subsidiaryCompanyId: '' }, depsFor(fourQuarters));

    expect(batch).toEqual({ symbol: '9999', rocYear: null, season: null, slots: { q: { action: 'skipped_no_quarter' }, ttm: { action: 'skipped_no_quarter' } } });
  });

  test('指定 year/season 時完全不呼叫 quarters port（沒提供也不會爆）', async () => {
    const statements = createInMemoryStatements(fourQuarters);
    const deps = createTestPitDeps({ statements, announcements: createFixedAnnouncements(announced) });

    const batch = await computeRoe(query, deps);
    expect(asComputation(batch.slots.q).value).toBe(8);
  });

  test('fake 的 reportDate 預設是該季期末日（fallback 路徑用得到）', () => {
    expect(quarterEndDate(115, 2)).toEqual(new Date('2026-06-30T00:00:00.000Z'));
  });
});
