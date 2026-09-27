import { expect, test } from 'vitest';
import { resolveNetCashFromInvestingActivities } from '@/domain/financials/cashFlowIdentity';

// 2603 114Q4 單季（千元）：營業 20,013,674、融資 12,010,000、匯率 4,400,000、現金增減 11,900,000 → 恆等式投資 −24,523,674
const q4 = { cash_flows_from_used_in_operating_activities: 20_013_674n, cash_flows_from_used_in_financing_activities: 12_010_000n, effect_of_exchange_rate_changes_on_cash_and_cash_equivalents: 4_400_000n, increase_decrease_in_cash_and_cash_equivalents: 11_900_000n };

test('原生小計跟恆等式差很多（前一季累計缺被當 0，第四季裝了全年）→ 用恆等式', () => {
  expect(resolveNetCashFromInvestingActivities({ ...q4, net_cash_flows_from_used_in_investing_activities: -109_000_000n })).toBe(-24_523_674n);
});

test('原生跟恆等式差 1 千元以內（進位）→ 照用原生；沒有原生 → 恆等式；恆等式缺項 → 原生', () => {
  expect(resolveNetCashFromInvestingActivities({ ...q4, net_cash_flows_from_used_in_investing_activities: -24_523_675n })).toBe(-24_523_675n);
  expect(resolveNetCashFromInvestingActivities(q4)).toBe(-24_523_674n);
  expect(resolveNetCashFromInvestingActivities({ net_cash_flows_from_used_in_investing_activities: -5n })).toBe(-5n);
});
