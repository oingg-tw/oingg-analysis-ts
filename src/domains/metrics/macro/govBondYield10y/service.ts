import govPrisma from '@/adapters/prisma/govClient';
import type { GovBondYield10yResult } from './types';

// 10年期公債殖利率最新值——2026-09-02 應 bff-ts/web-nuxt 要求新增，給 ValuationRankingCard
// 當中性的利率參考基準用（不做投資建議），只要最新一筆，不用整段歷史，所以不像
// equityRiskPremium 那樣要處理窗口/重疊區間。跟 equityRiskPremium 讀同一張表
// （govPrisma.monthlyGovBondYield10y，見該 model 的說明：來源是央行統計資料庫
// EG43M01en，本服務只讀不 migrate）。
export const getLatestGovBondYield10y = async (): Promise<GovBondYield10yResult> => {
  const warnings: string[] = [];

  const latest = await govPrisma.monthlyGovBondYield10y.findFirst({
    orderBy: [{ year: 'desc' }, { month: 'desc' }],
  });

  if (!latest) {
    warnings.push('查無任何一個月的 10 年期公債殖利率資料。');
    return { yieldPct: null, asOfMonth: null, warnings };
  }

  return {
    yieldPct: Number(latest.yieldRate),
    asOfMonth: `${latest.year}-${String(latest.month).padStart(2, '0')}`,
    warnings,
  };
};
