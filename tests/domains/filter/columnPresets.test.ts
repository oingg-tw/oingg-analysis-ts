import { test, describe } from 'vitest';
import assert from 'node:assert/strict';
import { columnPresets, findColumnPresetProblems, checkColumnPresetsConsistency } from '@/api/bff/filter/columnPresets';
import { filterCatalog } from '@/api/bff/filter/filterCatalog';

// 2026-09-08：bff-ts 實測抓到 columnPresets.ts 長期沒有跟著 filterCatalog.csv 的退場批次
// 同步更新（roe.roeTtmPct/debtRatio.debtRatioPct 早在 2026-09-07 就已經失效，這份清單
// 沒人記得回來改），連帶讓他們自己同步的預設組合帶著查無此欄位的欄位。新增
// findColumnPresetProblems 一致性檢查，見 columnPresets.ts 的說明。

describe('columnPresets', () => {
  test('真正的 columnPresets.ts 跟 filterCatalog.ts 應該一致（不拋錯）', () => {
    assert.doesNotThrow(() => checkColumnPresetsConsistency(false));
  });

  test('目前 filterCatalog 是空的，columnPresets 也應該是空的，不留殘留引用', () => {
    assert.deepEqual(columnPresets, []);
  });

  test('findColumnPresetProblems 對引用不存在欄位的 preset 應該正確抓出來，不是形同虛設的檢查', () => {
    const problems = findColumnPresetProblems([{ key: 'fake', name: '假預設', description: '', fieldKeys: ['notARealMetric.notARealField'] }], filterCatalog);
    assert.equal(problems.length, 1);
    assert.match(problems[0]!, /fake/);
    assert.match(problems[0]!, /notARealMetric\.notARealField/);
  });

  test('findColumnPresetProblems 對真的存在於 catalog 裡的欄位不應該誤判', () => {
    const syntheticCatalog = [
      {
        key: 'cat',
        name: '分類',
        metrics: [{ key: 'fakeMetric', name: '假指標', path: '/fake', unit: 'ratio' as const, fields: [{ key: 'fakeField', name: '假欄位', period: 'daily' as const, sort: 1 }] }],
      },
    ];
    const problems = findColumnPresetProblems([{ key: 'fake', name: '假預設', description: '', fieldKeys: ['fakeMetric.fakeField'] }], syntheticCatalog);
    assert.deepEqual(problems, []);
  });
});
