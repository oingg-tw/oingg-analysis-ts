import { resolveQuarterOrLatest } from '@/application/financials/latestQuarter';
import type { QuarterlyMetricQuery } from '@/domain/financials/quarterlyMetric';
import { resolveKnowledgeDate } from '../../knowledgeDate';
import type { MetricNullReason } from '../../../../domain/metrics/metricBasis';
import { rocYearToGregorian } from '@/domain/calendar/rocQuarter';
import { roundToSignificantFigures } from '../../../../domain/metrics/shared/numericHelpers';
import { periodTypeGroup } from '@/domain/metrics/coordinate';
import { computation, type ComputationBatch, type ComputationSlot, noQuarterBatch } from '@/domain/metrics/computation';
import type { PitDeps } from '@/application/metrics/deps';

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


export type MarketCapDeps = Pick<PitDeps, 'statements' | 'quarters' | 'announcements' | 'market'>;

export type MarketCapComputationBatch = ComputationBatch<'q'>;

export const computeMarketCap = async (
  query: QuarterlyMetricQuery,
  deps: MarketCapDeps
): Promise<MarketCapComputationBatch> => {
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

  const mainAnchor = await resolveKnowledgeDate(symbol, [{ rocYear, season: seasonNum, reportDate }], deps.announcements);
  const marketCapAsOf = mainAnchor ? await deps.market.getMarketCap(symbol, mainAnchor.knowledgeDate) : null;

  const marketCap = marketCapAsOf ? roundToSignificantFigures(marketCapAsOf.marketCap, 4) : null;
  const nullReason: MetricNullReason | null = marketCap === null ? determineNullReason() : null;

  let q: ComputationSlot;
  if (!mainAnchor) {
    q = { action: 'skipped_no_knowledge_date' };
  } else {
    q = computation({
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

  return { symbol, rocYear: year, season, slots: { q } };
};
