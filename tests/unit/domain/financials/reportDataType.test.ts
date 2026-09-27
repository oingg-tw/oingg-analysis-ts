import { expect, test } from 'vitest';
import { dataTypeForPeriod, latestDataType, type ReportAvailability } from '@/domain/financials/reportDataType';

const av = (o: Partial<ReportAvailability>): ReportAvailability => ({
  hasConsolidated: true, hasIndividual: false, earliestConsolidatedYq: 1093, latestConsolidatedYq: 1152, earliestIndividualYq: null, latestIndividualYq: null, ...o,
});

test('一般公司（只有合併）→ 一律 2；只有個體 → 一律 1', () => {
  expect(latestDataType(av({}))).toBe('2');
  expect(dataTypeForPeriod(av({}), 1141)).toBe('2');
  const indiv = av({ hasConsolidated: false, hasIndividual: true, earliestConsolidatedYq: null, latestConsolidatedYq: null, earliestIndividualYq: 1093, latestIndividualYq: 1152 });
  expect(latestDataType(indiv)).toBe('1');
  expect(dataTypeForPeriod(indiv, 1141)).toBe('1');
});

test('1727：合併 109Q3～113Q4、個體 113Q1～115Q2 → 113Q4 以前用合併（重疊期合併優先），114Q1 起用個體，最新是個體', () => {
  const a = av({ hasIndividual: true, earliestConsolidatedYq: 1093, latestConsolidatedYq: 1134, earliestIndividualYq: 1131, latestIndividualYq: 1152 });
  expect(dataTypeForPeriod(a, 1124)).toBe('2');
  expect(dataTypeForPeriod(a, 1132)).toBe('2');
  expect(dataTypeForPeriod(a, 1141)).toBe('1');
  expect(dataTypeForPeriod(a, 1152)).toBe('1');
  expect(latestDataType(a)).toBe('1');
});

test('合併只比個體晚 1 季（多半是合併晚交）→ 不切，仍用合併', () => {
  const a = av({ hasIndividual: true, latestConsolidatedYq: 1151, earliestIndividualYq: 1131, latestIndividualYq: 1152 });
  expect(latestDataType(a)).toBe('2');
  expect(dataTypeForPeriod(a, 1152)).toBe('2');
});

test('先有個體、後來才有合併（取得第一家子公司）→ 合併開始前用個體', () => {
  const a = av({ hasIndividual: true, earliestConsolidatedYq: 1121, latestConsolidatedYq: 1152, earliestIndividualYq: 1093, latestIndividualYq: 1114 });
  expect(dataTypeForPeriod(a, 1101)).toBe('1');
  expect(dataTypeForPeriod(a, 1121)).toBe('2');
});
