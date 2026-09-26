import { resolveQuarterOrLatest } from '@/application/financials/latestQuarter';
import { toCommonEquity } from '@/domain/financials/outstandingCommonShares';
import { toRatioFromNumbers, toPerShareExact } from '@/domain/metrics/shared/numericHelpers';
import { pickEquity } from '@/domain/metrics/shared/pickers';
import type { QuarterlyMetricQuery } from '@/domain/financials/quarterlyMetric';
import { resolveKnowledgeDate } from '../../knowledgeDate';
import type { MetricNullReason } from '../../../../domain/metrics/metricBasis';
import { rocYearToGregorian } from '@/domain/calendar/rocQuarter';
import { periodTypeGroup } from '@/domain/metrics/coordinate';
import { isComputationSkip, computation, type ComputationBatch, type ComputationSlot, noQuarterBatch } from '@/domain/metrics/computation';
import type { PitDeps } from '@/application/metrics/deps';

// 2026-09-22 formulaVersion 2：中繼 BVPS 改用不四捨五入的 toPerShareExact（見 numericHelpers.ts toPerShareExact 的說明）。
// 2026-09-26 formulaVersion 3：流通股數改為 IAS 33 流通在外普通股（已發行 − 特別股 − 庫藏股），EPS 類分子扣特別股股利、
// 每股淨值類分子扣特別股股本；讀股數或市值的指標一起跳版，讓下游有訊號知道值變了（使用者 2026-09-26 拍板）。
export const PB_RATIO_FORMULA_VERSION = 3;

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

  const shares = reportDate ? await deps.shares.getOutstandingCommonShares(symbol, reportDate) : null;
  const sharesValue = shares?.outstandingCommonShares ?? null;

  // 2026-09-25 分子只算普通股：權益扣特別股股本（見 domain/financials/outstandingCommonShares.ts）。
  const commonEquity = toCommonEquity(equity.value, shares?.preferredCapitalThousands ?? 0n);
  const bvps = commonEquity !== null && sharesValue !== null ? toPerShareExact(commonEquity, sharesValue) : null;

  const mainAnchor = await resolveKnowledgeDate(symbol, [{ rocYear, season: seasonNum, reportDate }], deps.announcements);
  const stockPrice = mainAnchor ? await deps.market.getStockPrice(symbol, mainAnchor.knowledgeDate, reportDate ?? undefined) : null;

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

  return { symbol, rocYear: year, season, slots: { q: isComputationSkip(q) ? q : { ...q, formulaVersion: PB_RATIO_FORMULA_VERSION } } };
};
