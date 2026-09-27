// 現金流量表恆等式：現金淨增減 = 營業 + 投資 + 融資 + 匯率影響。投資活動淨現金流用它推回來（2330 115Q2 驗證過跟原生欄位完全一致）。
// 缺營業、融資或現金淨增減任一項回 null；匯率影響缺漏視為 0。
export const deriveNetCashFromInvestingActivities = (accounts: Record<string, bigint>): bigint | null => {
  const netChangeInCash = accounts.increase_decrease_in_cash_and_cash_equivalents;
  const cfo = accounts.cash_flows_from_used_in_operating_activities;
  const cff = accounts.cash_flows_from_used_in_financing_activities;
  if (netChangeInCash === undefined || cfo === undefined || cff === undefined) return null;
  const fxEffect = accounts.effect_of_exchange_rate_changes_on_cash_and_cash_equivalents ?? 0n;
  return netChangeInCash - cfo - cff - fxEffect;
};

// 2026-09-27 原生小計跟恆等式對不上時，用恆等式：mops 單季表＝累計相減，前一季累計的投資小計缺（null）時被當成 0，
// 第四季單季就裝了全年的投資現金流（2603 114Q4 原生 −1,090 億、恆等式 −245.3 億，四季單季加總才回到全年 −1,090；
// 114Q4 全市場 674 家單季恆等式不成立，其他季每季 0~7 家——web-nuxt 做現金流組成圖時抓到）。同一份單季表另外四個數
// （營業、融資、匯率、現金增減）是完整的累計相減，用它們推回來的投資跟報表自身一致。差 1 千元以內（進位）照用原生值。
const MAX_IDENTITY_GAP_THOUSANDS = 1n;
export const resolveNetCashFromInvestingActivities = (accounts: Record<string, bigint>): bigint | null => {
  const native = accounts.net_cash_flows_from_used_in_investing_activities;
  const derived = deriveNetCashFromInvestingActivities(accounts);
  if (native === undefined) return derived;
  if (derived === null) return native;
  const gap = native > derived ? native - derived : derived - native;
  return gap <= MAX_IDENTITY_GAP_THOUSANDS ? native : derived;
};
