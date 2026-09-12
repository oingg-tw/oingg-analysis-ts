import { getLatestAvailableQuarter } from '@/shared/sourceData/latestQuarter';
import { getBalanceSheetXbrlFirst as getQuarterlyBalanceSheet } from '@/shared/sourceData/balanceSheetXbrlFirst';
import { getMarketCapAsOf } from '@/shared/sourceData/marketCap';
import type { QuarterlyMetricQuery } from '@/shared/quarterlyMetric';
import { resolveKnowledgeDate } from '../../knowledgeDate';

import { writeMetricValue, type MetricValueWriteOutcome, periodTypeGroup } from '../../metricValueWriter';
import type { MetricNullReason } from '../../metricBasis';
import { rocYearToGregorian } from '@/shared/rocQuarter';
import { roundToSignificantFigures } from '../../shared/numericHelpers';

// 市值 = 收盤價 × 流通股數，獨立立出 metric_code 的理由見 marketCapDefinition.ts 檔頭
// 說明。knowledge_date 解析比照 stockPrice（只用資產負債表，不查損益表），保證跟
// stockPrice/bvps/pbRatio/ncav 同步。只有 Q 一種 basis。
//
// 2026-09-11 使用者要求：個股篩選的市值欄位保留 4 位有效數字（不是小數位數）——市值
// 動輒幾千億到幾兆，固定小數位數沒有意義，改用有效數字才是使用者真正想看到的精度。
// 只影響這個 metricCode 寫入的值本身；altmanZScore/tobinsQ/greenblattEarningsYield
// 等其他指標的市值輸入都是各自獨立呼叫 getMarketCapAsOf 拿到完整精度的原始值，不會
// 讀這裡寫入的四捨五入後數字，不受影響。

const determineNullReason = (): MetricNullReason => 'missing_input';

type BasisOutcome = MetricValueWriteOutcome | { action: 'skipped_no_knowledge_date' } | { action: 'skipped_no_quarter' };

export interface MarketCapPitOutcome {
  symbol: string;
  rocYear: string | null;
  season: string | null;
  q: BasisOutcome;
}

export const computeAndWriteMarketCapPit = async (query: QuarterlyMetricQuery): Promise<MarketCapPitOutcome> => {
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
  const balanceSheet = await getQuarterlyBalanceSheet(key);
  const reportDate = balanceSheet?.reportDate ?? null;

  const mainAnchor = await resolveKnowledgeDate(symbol, [{ rocYear, season: seasonNum, reportDate }]);
  const marketCapAsOf = mainAnchor ? await getMarketCapAsOf(symbol, mainAnchor.knowledgeDate) : null;

  const marketCap = marketCapAsOf ? roundToSignificantFigures(marketCapAsOf.marketCap, 4) : null;
  const nullReason: MetricNullReason | null = marketCap === null ? determineNullReason() : null;

  let q: BasisOutcome;
  if (!mainAnchor) {
    q = { action: 'skipped_no_knowledge_date' };
  } else {
    q = await writeMetricValue({
      symbol,
      metricCode: 'marketCap',
      fiscalYear,
      fiscalQuarter: seasonNum,
      dataType,
      subsidiaryCompanyId,
      ...periodTypeGroup('Q'),
      value: marketCap,
      nullReason,
      knowledgeDate: mainAnchor.knowledgeDate,
      knowledgeDateIsFallback: mainAnchor.isFallback,
    });
  }

  return { symbol, rocYear: year, season, q };
};
