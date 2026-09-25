import { resolveQuarterOrLatest } from '@/application/financials/latestQuarter';
import { toCommonEquity } from '@/domain/financials/outstandingCommonShares';
import { calculateYoyGrowthRate, toPerShareExact } from '@/domain/metrics/shared/numericHelpers';
import { pickEquity } from '@/domain/metrics/shared/pickers';
import { getPastNQuarters, rocYearToGregorian, type Season } from '@/domain/calendar/rocQuarter';
import type { QuarterlyMetricQuery } from '@/domain/financials/quarterlyMetric';
import { resolveKnowledgeDate } from '../../knowledgeDate';
import { isComputationSkip, type ComputationBatch, noQuarterBatch, periodSlot } from '@/domain/metrics/computation';
import type { PitDeps } from '@/application/metrics/deps';

// 三張季度財報表金額單位是「千元」，流通股數是實際股數，分子要先 x1000 換算成元（跟 bvps.ts 一致）。
// 2026-09-22 formulaVersion 2：BVPS 中繼值不再四捨五入到分（理由同 epsGrowthRate），只在最後的百分比四捨五入一次。
// 2026-09-26 formulaVersion 3：流通股數改為 IAS 33 流通在外普通股（已發行 − 特別股 − 庫藏股），EPS 類分子扣特別股股利、
// 每股淨值類分子扣特別股股本；讀股數或市值的指標一起跳版，讓下游有訊號知道值變了（使用者 2026-09-26 拍板）。
export const BVPS_GROWTH_RATE_FORMULA_VERSION = 3;
const toBvps = (equityInThousands: bigint | null, shares: bigint | null): number | null => {
  if (equityInThousands === null || shares === null || shares === 0n) return null;
  return toPerShareExact(equityInThousands, shares);
};


export type BvpsGrowthRateDeps = Pick<PitDeps, 'statements' | 'quarters' | 'announcements' | 'shares'>;

export type BvpsGrowthRateComputationBatch = ComputationBatch<'q'>;

// BVPS 成長率（單季年增率）= (本季 BVPS - 去年同季 BVPS) / |去年同季 BVPS| * 100——獨立
// 重新計算本季/去年同季各自的 BVPS（不依賴 bvps 這個 metric_code 已寫入的值，跟
// epsGrowthRate 對 eps 的既有做法一致），流通股數各自用當下報告日對應的股本。跟
// equityGrowthRate（淨值總額成長率）搭配使用：淨值成長率 ≈ BVPS成長率 + 股本變化率——
// 兩者相等代表股本沒變動；BVPS成長率明顯低於淨值成長率，代表現金增資稀釋了每股淨值；
// 反之代表減資/買回墊高了每股淨值。跟 dividend 分類的 shareCountChangeRate 三支一起
// 組成第二張「淨值成長分解卡」，跟 growth 分類既有的 netIncomeGrowthRate/epsGrowthRate
// 那組（損益表視角）並列成資產負債表視角的版本。只有 Q 一種 basis——資產負債表時點快照，
// 沒有 TTM 概念（跟 bvps 自己一樣）。
export const computeBvpsGrowthRate = async (query: QuarterlyMetricQuery, deps: BvpsGrowthRateDeps): Promise<BvpsGrowthRateComputationBatch> => {
  const { symbol, dataType, subsidiaryCompanyId } = query;

  const resolvedQuarter = await resolveQuarterOrLatest(query, ['balanceSheet'], deps.quarters);

  if (!resolvedQuarter) {
    return noQuarterBatch(symbol, ['q']);
  }

  const { year, season } = resolvedQuarter;
  const rocYear = Number(year);
  const seasonNum = Number(season);
  const fiscalYear = rocYearToGregorian(rocYear);

  const key = { symbol, year: rocYear, quarter: seasonNum, dataType, subsidiaryCompanyId };
  const balanceSheet = await deps.statements.getBalanceSheet(key);
  const reportDate = balanceSheet?.reportDate ?? null;
  // 2026-09-25 分子只算普通股：權益扣特別股股本（見 domain/financials/outstandingCommonShares.ts）。
  const currentSharesInfo = reportDate ? await deps.shares.getOutstandingCommonShares(symbol, reportDate) : null;
  const currentBvps = toBvps(toCommonEquity(pickEquity(balanceSheet).value, currentSharesInfo?.preferredCapitalThousands ?? 0n), currentSharesInfo?.outstandingCommonShares ?? null);

  const prior = getPastNQuarters({ rocYear, season: season as Season }, 5)[0]!;
  const priorBalanceSheet = await deps.statements.getBalanceSheet({
    symbol,
    year: Number(prior.year),
    quarter: Number(prior.season),
    dataType,
    subsidiaryCompanyId,
  });
  const priorReportDate = priorBalanceSheet?.reportDate ?? null;
  const priorSharesInfo = priorReportDate ? await deps.shares.getOutstandingCommonShares(symbol, priorReportDate) : null;
  const priorBvps = toBvps(toCommonEquity(pickEquity(priorBalanceSheet).value, priorSharesInfo?.preferredCapitalThousands ?? 0n), priorSharesInfo?.outstandingCommonShares ?? null);

  const { value: growthRate, nullReason } = calculateYoyGrowthRate(currentBvps, priorBvps);

  const mainAnchor = await resolveKnowledgeDate(symbol, [{ rocYear, season: seasonNum, reportDate }], deps.announcements);
  const coordinateBase = { symbol, metricCode: 'bvpsGrowthRate', fiscalYear, fiscalQuarter: seasonNum, dataType, subsidiaryCompanyId };

  const q = periodSlot(mainAnchor, coordinateBase, 'Q', growthRate, nullReason);

  return { symbol, rocYear: year, season, slots: { q: isComputationSkip(q) ? q : { ...q, formulaVersion: BVPS_GROWTH_RATE_FORMULA_VERSION } } };
};
