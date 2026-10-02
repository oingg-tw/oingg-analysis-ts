import { expect, test } from 'vitest';
import { computeAltmanZDoublePrimeScore } from '@/application/metrics/resilience/altmanZDoublePrimeScore/computeAltmanZDoublePrimeScore';
import { createTestPitDeps } from '../../../../../fakes/pit/createTestPitDeps';

// 2026-10-02：Z″ 是非製造業模型，分不出是不是製造業（查不到稅籍分類）就不算，跟製造業、金融業一樣直接 skip、不寫任何一列。
const run = (section: string | null, isFinancial = false) =>
  computeAltmanZDoublePrimeScore(
    { symbol: '8050', year: '115', season: '2', dataType: '2', subsidiaryCompanyId: '' },
    createTestPitDeps({ industry: { getCompanySectionCode: async () => section, isFinancialIndustryCompany: async () => isFinancial, isSoftwareOrCloudIndustryCompany: async () => false } })
  );

test.each([
  ['查不到稅籍分類（上櫃／興櫃／境外註冊）', null, false],
  ['製造業 section C', 'C', false],
  ['金融業', 'K', true],
])('%s → skipped_no_quarter，不寫入', async (_label, section, isFinancial) => {
  const batch = await run(section, isFinancial);
  expect(batch.slots.ttm).toMatchObject({ action: 'skipped_no_quarter' });
});
