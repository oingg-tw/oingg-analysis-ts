import { resolveQuarterOrLatest } from '@/application/financials/latestQuarter';
import { rocYearToGregorian } from '@/domain/calendar/rocQuarter';
import type { QuarterlyMetricQuery } from '@/domain/financials/quarterlyMetric';
import { resolveKnowledgeDate } from '../../knowledgeDate';
import { calculateDividendPerShare } from '../../../../domain/metrics/dividend/dividendPerShare/calculateDividendPerShare';
import { periodTypeGroup } from '@/domain/metrics/coordinate';
import { computation, type ComputationBatch, noQuarterBatch } from '@/domain/metrics/computation';
import type { PitDeps } from '@/application/metrics/deps';

// 2026-09-15 應 web-nuxt「營收到股利去了哪裡」瀑布圖卡片需求新增。只有 TTM 一種 basis——股利通常一年發放 1~2 次，
// 單季數字大多是 0。
//
// 2026-09-25 改成「近一年除息的普通股每股現金股利」（公告值加總，見 calculateDividendPerShare.ts 的說明），不再用
// 現金流量表「發放現金股利 ÷ 流通股數」：那是普通股＋特別股的合計，分母又含特別股股數，web-nuxt 個股股利頁因此同一個
// 畫面上它跟 dividend-history 的 cashDividend 兩個「每股現金股利」對不上（2882 顯示 3.39 元）。
//
// 座標與 knowledge date 維持原樣：座標是季度（窗口終點＝該季季末），knowledge date 用該季財報的公告日——比實際知道
// 的時間（除息日）晚，是保守的，而且跟舊版同一個 knowledge date，重算時直接覆蓋舊值（updated_same_knowledge_date）。
// 改用除息日當 knowledge date 會比舊列早，查「最新一版」時反而拿到舊的現金流量表值。
// 定義檔 currentFormulaVersion 2（2026-09-25 從現金流量表改成公告值），compute 要標同一個版本，writer 才會收。
const DIVIDEND_PER_SHARE_FORMULA_VERSION = 2;

export type DividendPerShareDeps = Pick<PitDeps, 'statements' | 'quarters' | 'announcements' | 'dividendEvents'>;

export type DividendPerShareComputationBatch = ComputationBatch<'ttm'>;

export const computeDividendPerShare = async (query: QuarterlyMetricQuery, deps: DividendPerShareDeps): Promise<DividendPerShareComputationBatch> => {
  const { symbol, dataType, subsidiaryCompanyId } = query;

  const resolvedQuarter = await resolveQuarterOrLatest(query, ['cashFlowStatement'], deps.quarters);
  if (!resolvedQuarter) return noQuarterBatch(symbol, ['ttm']);

  const { year, season } = resolvedQuarter;
  const rocYear = Number(year);
  const seasonNum = Number(season);
  const fiscalYear = rocYearToGregorian(rocYear);

  const cashFlowStatement = await deps.statements.getCashFlowStatement({ symbol, year: rocYear, quarter: seasonNum, dataType, subsidiaryCompanyId });
  const reportDate = cashFlowStatement?.reportDate ?? null;
  const anchor = await resolveKnowledgeDate(symbol, [{ rocYear, season: seasonNum, reportDate }], deps.announcements);
  if (!anchor) return { symbol, rocYear: year, season, slots: { ttm: { action: 'skipped_no_knowledge_date' } } };

  // 窗口終點＝該季季末（UTC），跟舊版「近四季」同一段期間。
  const windowEnd = new Date(Date.UTC(fiscalYear, seasonNum * 3, 0));
  const events = await deps.dividendEvents.listDividendDistributionRows(symbol);
  const calc = calculateDividendPerShare(events, windowEnd);

  const ttm = computation({
    symbol,
    metricCode: 'dividendPerShare',
    fiscalYear,
    fiscalQuarter: seasonNum,
    dataType,
    subsidiaryCompanyId,
    ...periodTypeGroup('TTM'),
    value: calc.value,
    nullReason: calc.nullReason,
    knowledgeDate: anchor.knowledgeDate,
    knowledgeDateIsFallback: anchor.isFallback,
    formulaVersion: DIVIDEND_PER_SHARE_FORMULA_VERSION,
  });

  return { symbol, rocYear: year, season, slots: { ttm } };
};
