import { describe, expect, test } from 'vitest';
import { computePretaxIncomePerShare } from '@/application/metrics/profitability/pretaxIncomePerShare/computePretaxIncomePerShare';
import { isComputationSkip, type MetricComputation } from '@/domain/metrics/computation';
import { createInMemoryStatements, type StatementsSeed } from '../../../../../fakes/pit/inMemoryStatements';
import { createFixedAnnouncements } from '../../../../../fakes/pit/fixedAnnouncements';
import { createTestPitDeps } from '../../../../../fakes/pit/createTestPitDeps';

// 2026-09-18 銀行業 fallback 的邊界案例——手工 seed，不用 cassette，因為一般損益表跟銀行監理
// 專用表「兩邊都有資料但一邊缺一季」這種真實案例目前在資料庫裡找不到（實測 113Q3~115Q2、
// 10 家銀行/金控：7 家consolidated（dataType='2'）兩邊資料完全同步、3 家（2820/2836/2849）
// 只申報 dataType='1'，一般表跟銀行表在同一個 dataType 下永遠同步，沒有「一邊有一邊沒有」的
// 自然案例）。這裡直接控制兩張表的內容，確保 fallback 分支本身邏輯正確、非銀行公司不會被
// 誤觸發。真實數字（2330 115Q2）仍由 pretaxIncomePerSharePit.test.ts 的 cassette 守著。

const query = { symbol: '2820', year: '115', season: '2' as const, dataType: '2' as const, subsidiaryCompanyId: '' };

const announced = { '2820-115Q2': new Date('2026-08-14T00:00:00.000Z') };

const asComputation = (slot: MetricComputation | { action: string }): MetricComputation => {
  if (isComputationSkip(slot as never)) throw new Error(`預期是一筆計算結果，卻是 skip：${JSON.stringify(slot)}`);
  return slot as MetricComputation;
};

const sharesPort = { getPaidInShares: async () => ({ paidInShares: 1_000_000_000n, effectiveYear: 2025, effectiveMonth: 1 }) };

describe('computePretaxIncomePerShare 的銀行業 fallback', () => {
  test('一般損益表這一季查無資料、是銀行/金控 → 退回銀行監理專用表的稅前淨利', async () => {
    const seed: StatementsSeed = {
      '2820': {
        '115Q2': { bankIncome: { profitBeforeTax: 946_773n } }, // income 完全不給，模擬一般損益表查無這一季
      },
    };
    const statements = createInMemoryStatements(seed);
    const deps = createTestPitDeps({
      statements,
      quarters: statements,
      announcements: createFixedAnnouncements(announced),
      shares: sharesPort,
      industry: { isFinancialIndustryCompany: async () => true, isSoftwareOrCloudIndustryCompany: async () => false, getCompanySectionCode: async () => null },
    });

    const batch = await computePretaxIncomePerShare(query, deps);
    const q = asComputation(batch.slots.q);

    expect(q.value).toBe(0.95);
    expect(q.nullReason).toBeNull();
  });

  test('一般損益表這一季查無資料、不是銀行/金控 → 不查銀行專用表，維持 null', async () => {
    const seed: StatementsSeed = {
      '2330': {
        '115Q2': { bankIncome: { profitBeforeTax: 946_773n } }, // 就算銀行表剛好有值，非銀行公司也不能用
      },
    };
    const statements = createInMemoryStatements(seed);
    const deps = createTestPitDeps({
      statements,
      quarters: statements,
      announcements: createFixedAnnouncements({ '2330-115Q2': new Date('2026-08-14T00:00:00.000Z') }),
      shares: sharesPort,
      industry: { isFinancialIndustryCompany: async () => false, isSoftwareOrCloudIndustryCompany: async () => false, getCompanySectionCode: async () => null },
    });

    const batch = await computePretaxIncomePerShare({ ...query, symbol: '2330' }, deps);
    const q = asComputation(batch.slots.q);

    expect(q.value).toBeNull();
    expect(q.nullReason).toBe('missing_input');
  });

  test('一般損益表跟銀行專用表都查無這一季、是銀行/金控 → 仍然是 null（fallback 不會憑空生資料）', async () => {
    const seed: StatementsSeed = { '2820': { '115Q2': {} } };
    const statements = createInMemoryStatements(seed);
    const deps = createTestPitDeps({
      statements,
      quarters: statements,
      announcements: createFixedAnnouncements(announced),
      shares: sharesPort,
      industry: { isFinancialIndustryCompany: async () => true, isSoftwareOrCloudIndustryCompany: async () => false, getCompanySectionCode: async () => null },
    });

    const batch = await computePretaxIncomePerShare(query, deps);
    const q = asComputation(batch.slots.q);

    expect(q.value).toBeNull();
    expect(q.nullReason).toBe('missing_input');
  });
});
