import { buildFieldStatuses } from '@/domain/metrics/metricStatus';
import type { AppDeps } from '@/application/deps';
import type { GovBondYield10yResult } from './types';

// 10年期公債殖利率最新值——2026-09-02 應 bff-ts/web-nuxt 要求新增，給 ValuationRankingCard
// 當中性的利率參考基準用（不做投資建議），只要最新一筆，不用整段歷史，所以不像
// equityRiskPremium 那樣要處理窗口/重疊區間。2026-09-03 使用者決定 curated 中台層現階段太早，
// 改回直接查 gov-ts 的 export view（來源是央行統計資料庫 EG43M01en）；2026-09-17 Phase 4 查詢透過
// MacroDataPort 注入。
export const getLatestGovBondYield10y = async (deps: Pick<AppDeps, 'macroData'>): Promise<GovBondYield10yResult> => {
  const warnings: string[] = [];

  const latest = await deps.macroData.getLatestGovBondYield10y();

  if (!latest) {
    warnings.push('查無任何一個月的 10 年期公債殖利率資料。');
    return {
      yieldPct: null,
      asOfMonth: null,
      fieldStatuses: buildFieldStatuses([['yieldPct', { status: 'no_data', message: '查無任何一個月的 10 年期公債殖利率資料。' }]]),
      warnings,
    };
  }

  return {
    yieldPct: latest.yieldRate,
    asOfMonth: `${latest.year}-${String(latest.month).padStart(2, '0')}`,
    fieldStatuses: {},
    warnings,
  };
};
