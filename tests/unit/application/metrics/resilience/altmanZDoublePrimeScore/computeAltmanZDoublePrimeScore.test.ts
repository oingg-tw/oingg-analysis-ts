import { expect, test } from 'vitest';
import { computeAltmanZDoublePrimeScore } from '@/application/metrics/resilience/altmanZDoublePrimeScore/computeAltmanZDoublePrimeScore';
import { createTestPitDeps } from '../../../../../fakes/pit/createTestPitDeps';

// 2026-10-02：Z″ 是非製造業模型，只算明確屬於非製造業的交易所類股；製造業、模糊類股、金融業、查不到類股一律直接 skip、不寫任何一列。
const run = (sector: string | null) =>
  computeAltmanZDoublePrimeScore(
    { symbol: '8050', year: '115', season: '2', dataType: '2', subsidiaryCompanyId: '' },
    createTestPitDeps({ industry: { getSecuritiesSectorCode: async () => sector, isFinancialIndustryCompany: async () => sector === '17', isSoftwareOrCloudIndustryCompany: async () => false } })
  );

test.each([
  ['查不到類股', null],
  ['半導體業（製造業）', '24'],
  ['生技醫療業（模糊，使用者拍板不算）', '22'],
  ['金融保險業', '17'],
])('%s → skipped_no_quarter，不寫入', async (_label, sector) => {
  expect((await run(sector)).slots.ttm).toMatchObject({ action: 'skipped_no_quarter' });
});

test('建材營造業（非製造業）→ 會往下算（這裡沒有財報，越過 gating 後讀財報才停）', async () => {
  await expect(run('14')).rejects.toThrow(/測試沒有提供 deps./);
});
