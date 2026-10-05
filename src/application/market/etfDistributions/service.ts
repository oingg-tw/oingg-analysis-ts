import type { AppDeps } from '@/application/deps';
import type { EtfDistributionEvent, EtfDistributionsResult } from './types';

// 2026-10-05 逐檔 ETF 收益分配。使用者選「做一支逐檔 ETF 配息端點」：web-nuxt 持股頁原本用 12 次除息月曆拼近 12 個月配息
// （Nitro 快取路由），而公司的 GET /companies/dividend-history 對 ETF 是空的——ETF 沒有「股利所屬年度」、欄位也不同，不硬塞進去。
// 資料就是除息月曆的 ETF 列（sitca-ts fundclear_etf_dividend），口徑跟月曆一致：除息日早於今天＝已實現。
export type EtfDistributionsDeps = Pick<AppDeps, 'etfData'>;

const toIso = (d: Date | null): string | null => (d ? d.toISOString().slice(0, 10) : null);
const toNumberOrNull = (value: unknown): number | null => (value === null || value === undefined ? null : Number(value));

export const getEtfDistributions = async (symbol: string, deps: EtfDistributionsDeps, now: Date = new Date()): Promise<EtfDistributionsResult> => {
  const today = new Date(now.toISOString().slice(0, 10));
  const windowStart = new Date(Date.UTC(today.getUTCFullYear() - 1, today.getUTCMonth(), today.getUTCDate() + 1));
  const windowEnd = new Date(today.getTime() - 86_400_000);

  const rows = await deps.etfData.listEtfDividendsForSymbol(symbol);
  const events: EtfDistributionEvent[] = rows.map((r) => ({
    exDividendDate: toIso(r.ex_dividend_date)!,
    recordDate: toIso(r.record_date),
    paymentDate: toIso(r.payment_date),
    distributionPerUnit: toNumberOrNull(r.distribution_per_unit),
    status: r.ex_dividend_date >= today ? 'announced' : 'realized',
  }));
  const inWindow = rows.filter((r) => r.ex_dividend_date >= windowStart && r.ex_dividend_date <= windowEnd);
  const trailing = Math.round(inWindow.reduce((sum, r) => sum + (toNumberOrNull(r.distribution_per_unit) ?? 0), 0) * 10000) / 10000;

  return {
    symbol,
    found: rows.length > 0,
    trailing12MonthDistributionPerUnit: rows.length > 0 ? trailing : null,
    trailing12MonthWindow: { start: toIso(windowStart)!, end: toIso(windowEnd)! },
    events,
  };
};
