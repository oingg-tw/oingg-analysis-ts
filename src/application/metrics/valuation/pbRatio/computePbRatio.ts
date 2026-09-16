import { resolveQuarterOrLatest } from '@/application/financials/latestQuarter';
import { toPerShare, toRatioFromNumbers } from '@/domain/metrics/shared/numericHelpers';
import { pickEquity } from '@/domain/metrics/shared/pickers';
import type { QuarterlyMetricQuery } from '@/domain/financials/quarterlyMetric';
import { resolveKnowledgeDate } from '../../knowledgeDate';
import type { MetricNullReason } from '../../../../domain/metrics/metricBasis';
import { rocYearToGregorian } from '@/domain/calendar/rocQuarter';
import { periodTypeGroup } from '@/domain/metrics/coordinate';
import { computation, type ComputationBatch, type ComputationSlot, noQuarterBatch } from '@/domain/metrics/computation';
import type { PitDeps } from '@/application/metrics/deps';

// 本淨比（PB）= 股價(knowledge_date) / BVPS(本季期末權益/流通股數)。獨立重新實作，不呼叫
// computeBvpsPit——分子分母算法直接複製自 bvps/computeBvpsPit.ts，保持每支 PIT 檔案獨立、
// 不互相依賴的既有原則。只有 Q 一種 basis：BVPS 是資產負債表時點快照，跟 bvps 自己一樣
// 沒有 TTM/年化概念。
//
// 股價直接複用 resolveKnowledgeDate 算出來的 knowledge_date 去查 getStockPriceAsOf，
// 是 fcfYield/psr/pFcf/evEbitda 已經驗證過的既有模式。
//
// null_reason 沿用 evEbitda/roe 已定案的判斷：BVPS 剛好等於 0 才是
// zero_or_negative_denominator，BVPS 為負（資不抵債）仍然算出一個真實但為負的本淨比，
// 不隱藏成 null。


export type PbRatioDeps = Pick<PitDeps, 'statements' | 'quarters' | 'announcements' | 'shares' | 'market'>;

export type PbRatioComputationBatch = ComputationBatch<'q'>;

export const computePbRatio = async (
  query: QuarterlyMetricQuery,
  deps: PbRatioDeps
): Promise<PbRatioComputationBatch> => {
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
  const equity = pickEquity(balanceSheet);
  const reportDate = balanceSheet?.reportDate ?? null;

  const shares = reportDate ? await deps.shares.getPaidInShares(symbol, reportDate) : null;
  const sharesValue = shares?.paidInShares ?? null;

  const bvps = equity.value !== null && sharesValue !== null ? toPerShare(equity.value, sharesValue) : null;

  const mainAnchor = await resolveKnowledgeDate(symbol, [{ rocYear, season: seasonNum, reportDate }], deps.announcements);
  const stockPrice = mainAnchor ? await deps.market.getStockPrice(symbol, mainAnchor.knowledgeDate) : null;

  const pbRatio = bvps !== null && stockPrice !== null ? toRatioFromNumbers(stockPrice.closePrice, bvps) : null;

  let nullReason: MetricNullReason | null = null;
  if (pbRatio === null) {
    if (bvps === null || stockPrice === null) nullReason = 'missing_input';
    else nullReason = 'zero_or_negative_denominator';
  }

  let q: ComputationSlot;
  if (!mainAnchor) {
    q = { action: 'skipped_no_knowledge_date' };
  } else {
    q = computation({
      symbol,
      metricCode: 'pbRatio',
      fiscalYear,
      fiscalQuarter: seasonNum,
      dataType,
      subsidiaryCompanyId,
      ...periodTypeGroup('Q'),
      value: pbRatio,
      nullReason,
      knowledgeDate: mainAnchor.knowledgeDate,
      knowledgeDateIsFallback: mainAnchor.isFallback,
    });
  }

  return { symbol, rocYear: year, season, slots: { q } };
};
