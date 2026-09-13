import { getLatestAvailableQuarter } from '@/shared/sourceData/latestQuarter';
import { financialDataAdapter, type BalanceSheetPort, type StockPricePort } from '@/domainPitMetrics/shared/ports/financialDataPorts';
import type { QuarterlyMetricQuery } from '@/shared/quarterlyMetric';
import { resolveKnowledgeDate } from '../../knowledgeDate';

import { writeMetricValue, type MetricValueWriteOutcome, periodTypeGroup } from '../../metricValueWriter';
import type { MetricNullReason } from '../../metricBasis';
import { rocYearToGregorian } from '@/shared/rocQuarter';

// 2026-09-07 web-nuxt 要求：peRatio/pbRatio 河流圖需要「該期實際用來算比率的股價」本身，
// 不要用 peRatio×eps 反推（會累積四捨五入誤差，且 peRatio 為 null 時——例如 TTM 虧損——
// 反推不出股價，連帶讓本來算得出來的 pbRatio 河流圖也跟著空掉）。這支獨立公開股價本身，
// 不依賴 peRatio/pbRatio 是否算得出來。
//
// 知識時點解析比照 bvps.ts（只用資產負債表，不查損益表）——這代表 stockPrice 的
// knowledgeDate 保證跟 pbRatio（也是只用資產負債表）完全一致；跟 peRatio（用損益表
// 解析 knowledgeDate）在絕大多數情況下也會一致（同一次申報通常資產負債表跟損益表用
// 同一個報告日），但沒有數學上的保證一定相同，這是已知、可接受的限制。只有 Q 一種
// basis——股價本身沒有 TTM/年化概念。

const determineNullReason = (): MetricNullReason => 'missing_input';

type BasisOutcome = MetricValueWriteOutcome | { action: 'skipped_no_knowledge_date' } | { action: 'skipped_no_quarter' };

export interface StockPricePitOutcome {
  symbol: string;
  rocYear: string | null;
  season: string | null;
  q: BasisOutcome;
}

export const computeAndWriteStockPricePit = async (
  query: QuarterlyMetricQuery,
  statements: BalanceSheetPort & StockPricePort = financialDataAdapter
): Promise<StockPricePitOutcome> => {
  const { symbol, dataType, subsidiaryCompanyId } = query;

  const resolvedQuarter =
    query.year !== undefined && query.season !== undefined
      ? { year: query.year, season: query.season }
      : await getLatestAvailableQuarter(symbol, dataType, subsidiaryCompanyId, ['balanceSheet']);

  if (!resolvedQuarter) {
    return { symbol, rocYear: null, season: null, q: { action: 'skipped_no_quarter' } };
  }

  const { year, season } = resolvedQuarter;
  const rocYear = Number(year);
  const seasonNum = Number(season);
  const fiscalYear = rocYearToGregorian(rocYear);

  const key = { symbol, year: rocYear, quarter: seasonNum, dataType, subsidiaryCompanyId };
  const balanceSheet = await statements.getBalanceSheet(key);
  const reportDate = balanceSheet?.reportDate ?? null;

  const mainAnchor = await resolveKnowledgeDate(symbol, [{ rocYear, season: seasonNum, reportDate }]);
  const stockPrice = mainAnchor ? await statements.getStockPrice(symbol, mainAnchor.knowledgeDate) : null;

  const price = stockPrice?.closePrice ?? null;
  const nullReason: MetricNullReason | null = price === null ? determineNullReason() : null;

  let q: BasisOutcome;
  if (!mainAnchor) {
    q = { action: 'skipped_no_knowledge_date' };
  } else {
    q = await writeMetricValue({
      symbol,
      metricCode: 'stockPrice',
      fiscalYear,
      fiscalQuarter: seasonNum,
      dataType,
      subsidiaryCompanyId,
      ...periodTypeGroup('Q'),
      value: price,
      nullReason,
      knowledgeDate: mainAnchor.knowledgeDate,
      knowledgeDateIsFallback: mainAnchor.isFallback,
    });
  }

  return { symbol, rocYear: year, season, q };
};
