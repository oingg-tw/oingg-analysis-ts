import { describe, expect, test } from 'vitest';
import { decideWrite, persistComputations, persistOne, validateCoordinate, valuesEqual } from '@/application/metrics/persistComputations';
import type { MetricDefinitionLookup } from '@/application/ports/metricDefinitions';
import { periodTypeGroup, rollingWindowGroup } from '@/domain/metrics/coordinate';
import { periodSlot, noQuarterBatch, type ComputationBatch, type MetricComputation } from '@/domain/metrics/computation';
import { roeDefinition } from '@/domain/metrics/profitability/roe/roeDefinition';
import { betaDefinition } from '@/domain/metrics/valuation/beta/betaDefinition';
import { createInMemoryMetricValues } from '../../../fakes/pit/inMemoryMetricValues';

// persistComputations 是舊 metricValueWriter.writeMetricValue 的本體搬家（Phase 3），這裡用記憶體
// repository 把「比對既有列決定 insert / 就地更新 / 不寫」的四種決策跟座標驗證釘住——這些規則
// 直接決定 metric_values 落地的內容，重構期間一個分支都不能漂。

const definitions: MetricDefinitionLookup = {
  get: (metricCode) => ({ roe: roeDefinition, beta: betaDefinition })[metricCode],
};

const roeQ = (overrides: Partial<MetricComputation> = {}): MetricComputation => ({
  symbol: '2330',
  metricCode: 'roe',
  ...periodTypeGroup('Q'),
  fiscalYear: 2026,
  fiscalQuarter: 2,
  dataType: '2',
  subsidiaryCompanyId: '',
  value: 10.98,
  nullReason: null,
  knowledgeDate: new Date('2026-08-12T00:00:00.000Z'),
  knowledgeDateIsFallback: false,
  formulaVersion: roeDefinition.currentFormulaVersion, // 2026-09-22 起 writer 會拒絕跟定義檔對不上的版本
  ...overrides,
});

describe('valuesEqual：相對容差', () => {
  test('小數字用 1e-9 的絕對下限，市值等級的數字用 1e-12 × 量級', () => {
    expect(valuesEqual(10.98, 10.98)).toBe(true);
    expect(valuesEqual(10.98, 10.981)).toBe(false);
    // 2317 marketCap 114Q1 的真實案例：float64 在 1e12 的浮點雜訊遠大於 1e-9，改相對容差前每次重跑都被判「值變了」。
    expect(valuesEqual(1_234_567_890_123.4, 1_234_567_890_123.4 + 0.0005)).toBe(true);
    expect(valuesEqual(1_234_567_890_123.4, 1_234_567_890_125)).toBe(false);
    expect(valuesEqual(null, null)).toBe(true);
    expect(valuesEqual(null, 0)).toBe(false);
  });
});

describe('decideWrite：既有列 vs 新輸入的四種決策', () => {
  const input = { value: 10.98, nullReason: null, knowledgeDate: new Date('2026-08-12T00:00:00.000Z') };

  test('沒有既有列 → insert', () => {
    expect(decideWrite(null, input)).toEqual({ action: 'insert' });
  });

  test('value 與 nullReason 都相同 → skipped_unchanged（既有列的 value 可能是 Decimal 之類的物件，用 Number() 比）', () => {
    const existing = { value: { toString: () => '10.98', valueOf: () => 10.98 }, nullReason: null, knowledgeDate: new Date('2026-05-01T00:00:00.000Z') };
    expect(decideWrite(existing, input)).toEqual({ action: 'skipped_unchanged' });
  });

  test('值一樣但 formulaVersion 不同（公式改版後這家剛好算出同一個數字）→ 就地覆蓋，不留舊版本號', () => {
    const sameValue = { value: 10.98, nullReason: null, knowledgeDate: input.knowledgeDate };
    expect(decideWrite({ ...sameValue, formulaVersion: 1 }, { ...input, formulaVersion: 2 })).toEqual({ action: 'update_same_knowledge_date' });
    expect(decideWrite({ ...sameValue, formulaVersion: 2 }, { ...input, formulaVersion: 2 })).toEqual({ action: 'skipped_unchanged' });
  });

  test('值不同、knowledgeDate 相同 → 同一天重算，就地覆蓋', () => {
    const existing = { value: 9.5, nullReason: null, knowledgeDate: input.knowledgeDate };
    expect(decideWrite(existing, input)).toEqual({ action: 'update_same_knowledge_date' });
  });

  test('值不同、knowledgeDate 比既有列新 → 重編疊加（insert）', () => {
    const existing = { value: 9.5, nullReason: null, knowledgeDate: new Date('2026-05-01T00:00:00.000Z') };
    expect(decideWrite(existing, input)).toEqual({ action: 'insert' });
  });

  test('value 相同但 nullReason 不同也算變了', () => {
    const existing = { value: null, nullReason: 'missing_input', knowledgeDate: input.knowledgeDate };
    expect(decideWrite(existing, { ...input, value: null, nullReason: 'insufficient_history' })).toEqual({ action: 'update_same_knowledge_date' });
  });
});

describe('validateCoordinate：spec v0.2 §5.5 的強制檢查', () => {
  test('未註冊的 metricCode 一律拒絕', () => {
    expect(validateCoordinate(roeQ({ metricCode: 'nope' }), undefined)?.action).toBe('rejected');
  });

  test('季報型：periodType 要在 allowedPeriodTypes 內、其他三個欄位必須 N/A、fiscalYear/fiscalQuarter 必填', () => {
    expect(validateCoordinate(roeQ(), roeDefinition)).toBeNull();
    expect(validateCoordinate(roeQ({ periodType: 'FY' }), roeDefinition)?.reason).toContain('allowedPeriodTypes');
    expect(validateCoordinate(roeQ({ lookbackRange: '1Y' }), roeDefinition)?.reason).toContain("必須都是 'N/A'");
    expect(validateCoordinate(roeQ({ fiscalQuarter: undefined }), roeDefinition)?.reason).toContain('fiscalYear/fiscalQuarter 必填');
  });

  test('滾動統計量：periodType 必須 N/A、lookbackRange/samplingInterval 成對、tradeDate 必填', () => {
    const beta = (overrides: Partial<MetricComputation>): MetricComputation =>
      roeQ({ metricCode: 'beta', formulaVersion: betaDefinition.currentFormulaVersion, ...rollingWindowGroup('1Y', '1D'), fiscalYear: undefined, fiscalQuarter: undefined, tradeDate: new Date('2026-09-01T00:00:00.000Z'), ...overrides });
    expect(validateCoordinate(beta({}), betaDefinition)).toBeNull();
    expect(validateCoordinate(beta({ periodType: 'Q' }), betaDefinition)?.reason).toContain('periodType/snapshotCadence 必須都是');
    expect(validateCoordinate(beta({ samplingInterval: 'N/A' }), betaDefinition)?.reason).toContain('成對的正交維度');
    expect(validateCoordinate(beta({ lookbackRange: '10Y' as never }), betaDefinition)?.reason).toContain('allowedLookbackRanges');
    expect(validateCoordinate(beta({ tradeDate: null }), betaDefinition)?.reason).toContain('tradeDate 必填');
  });
});

describe('persistOne：記憶體 repository 上的完整寫入路徑', () => {
  test('第一次 inserted、原樣重跑 skipped_unchanged、同一天改值就地覆蓋（列數不變）、更新的 knowledgeDate 疊加新列', async () => {
    const metricValues = createInMemoryMetricValues();
    const deps = { metricValues, definitions };

    expect(await persistOne(roeQ(), deps)).toEqual({ action: 'inserted' });
    expect(await persistOne(roeQ(), deps)).toEqual({ action: 'skipped_unchanged' });
    expect(metricValues.rows()).toHaveLength(1);

    expect(await persistOne(roeQ({ value: 11.02 }), deps)).toEqual({ action: 'updated_same_knowledge_date' });
    expect(metricValues.rows()).toHaveLength(1);
    expect(metricValues.rows()[0]!.values.value).toBe(11.02);
    expect(metricValues.rows()[0]!.values.formulaVersion).toBe(roeDefinition.currentFormulaVersion);

    const restated = roeQ({ value: 11.5, knowledgeDate: new Date('2026-11-14T00:00:00.000Z') });
    expect(await persistOne(restated, deps)).toEqual({ action: 'inserted' });
    expect(metricValues.rows()).toHaveLength(2);
    // 之後查「目前市場最後所知」要拿到重編後的那一列。
    expect(await persistOne(restated, deps)).toEqual({ action: 'skipped_unchanged' });
  });

  test('座標驗證失敗時什麼都不寫', async () => {
    const metricValues = createInMemoryMetricValues();
    const outcome = await persistOne(roeQ({ periodType: 'FY' }), { metricValues, definitions });
    expect(outcome.action).toBe('rejected');
    expect(metricValues.rows()).toHaveLength(0);
  });
});

describe('persistComputations：整批攤平成舊 outcome 形狀', () => {
  test('slot 依插入順序寫入，skip 原樣帶過，結果 = { ...context, ...outcomes }', async () => {
    const metricValues = createInMemoryMetricValues();
    const anchor = { knowledgeDate: new Date('2026-08-12T00:00:00.000Z'), isFallback: false };
    const base = { symbol: '2330', metricCode: 'roe', fiscalYear: 2026, fiscalQuarter: 2, dataType: '2', subsidiaryCompanyId: '' };
    const batch: ComputationBatch<'q' | 'ttm'> = {
      symbol: '2330',
      rocYear: '115',
      season: '2',
      slots: {
        q: { ...periodSlot(anchor, base, 'Q', 10.98, null), formulaVersion: roeDefinition.currentFormulaVersion },
        ttm: periodSlot(null, base, 'TTM', 34.78, null),
      },
    };

    const persisted = await persistComputations(batch, { metricValues, definitions });

    expect(persisted).toEqual({ symbol: '2330', rocYear: '115', season: '2', q: { action: 'inserted' }, ttm: { action: 'skipped_no_knowledge_date' } });
    expect(metricValues.rows()).toHaveLength(1);
    expect(metricValues.rows()[0]!.where).toMatchObject({ metricCode: 'roe', periodType: 'Q', fiscalYear: 2026, fiscalQuarter: 2 });
  });

  test('noQuarterBatch 攤平後就是舊架構的 skipped_no_quarter 回傳值', async () => {
    const persisted = await persistComputations(noQuarterBatch('9999', ['q', 'ttm']), { metricValues: createInMemoryMetricValues(), definitions });
    expect(persisted).toEqual({ symbol: '9999', rocYear: null, season: null, q: { action: 'skipped_no_quarter' }, ttm: { action: 'skipped_no_quarter' } });
  });
});
