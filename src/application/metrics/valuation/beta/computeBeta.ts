import { resolveDailyCadenceKnowledgeDate } from '../../knowledgeDate';
import type { LookbackRange, SamplingInterval } from '../../../../domain/metrics/metricBasis';
import { BETA_WINDOW_CONFIGS, calculateBetaWindow, subtractYears, toDateString, type BetaWindowConfig, type OverlapPoint } from '@/domain/metrics/valuation/beta/calculateBeta';
import { rollingWindowGroup } from '@/domain/metrics/coordinate';
import { computation, type ComputationSlot, type DailyComputationBatch } from '@/domain/metrics/computation';
import type { PitDeps } from '@/application/metrics/deps';

// 獨立重新實作 src/domainMetrics/beta.ts——同一套公式跟降頻邏輯（不呼叫舊架構），改寫成
// pitMetrics 的寫入形狀：舊架構是「一列存三個窗口」，這裡是「一個 metricCode='beta'，
// 四個 (lookbackRange, samplingInterval) 組合各自一列」（1Y×1D/2Y×1W/3Y×1W/5Y×1M，見
// metricBasis.ts 的說明），跟 dupont 家族「一個概念拆成多個獨立 metric_code」的先例是
// 同一種精神，只是這裡反過來是「一個 metric_code、多個 (lookbackRange, samplingInterval)
// 組合」，因為四個窗口本來就是同一個概念（系統性風險係數）在不同取樣頻率下的版本，不是
// 四個不同概念。
//
// 2026-09-17 clean architecture 重構 Phase 3：公式、降頻、窗口計算（純函式）搬到
// domain/metrics/valuation/beta/calculateBeta.ts，這裡只剩「查價格序列 → 對齊重疊交易日 →
// 逐窗口計算 → 寫入」的編排。
//
// knowledgeDate 用 resolveDailyCadenceKnowledgeDate——逐日股價資料沒有公告延遲，基準
// 交易日當天就是市場已知的那天，跟 knowledgeDate.ts 的既有說明一致。2026-09-09 起
// Beta 寫進獨立的 metric_daily_cadence_values（不再跟季報型指標共用 metric_values），
// tradeDate 是那張表真正的自然鍵（NOT NULL），不再需要 fiscalYear/fiscalQuarter 這種
// 假裝有意義的欄位——跟 MarketRatios（computeMarketRatiosPit.ts）同一套逐日型指標
// 寫入慣例。

export type { BetaSamplingFrequency } from '@/domain/metrics/valuation/beta/calculateBeta';

export interface BetaPitQuery {
  symbol: string;
  date?: Date; // 選填，格式對齊舊架構的 asOfDate；不給就抓「股價跟指數都有資料的最新一個重疊交易日」
  dataType: '1' | '2';
  subsidiaryCompanyId: string;
}



export type BetaDeps = Pick<PitDeps, 'market'>;

export type BetaComputationBatch = DailyComputationBatch<'beta1YDaily' | 'beta2YWeekly' | 'beta3YWeekly' | 'beta5YMonthly'>;

export const computeBeta = async (query: BetaPitQuery, deps: BetaDeps): Promise<BetaComputationBatch> => {
  const { symbol, date, dataType, subsidiaryCompanyId } = query;

  const skippedNoTradeDate: BetaComputationBatch = { symbol, tradeDate: null, slots: { beta1YDaily: { action: 'skipped_no_trade_date' }, beta2YWeekly: { action: 'skipped_no_trade_date' }, beta3YWeekly: { action: 'skipped_no_trade_date' }, beta5YMonthly: { action: 'skipped_no_trade_date' } } };

  const fiveYearsBack = subtractYears(date ?? new Date(), 5);

  // 價格序列的 raw SQL 在 infrastructure/repositories/twse/dailyPriceSeries.ts（有指定 date 才加 <= 條件）。
  const [stockRows, indexRows, earliestTradeDate] = await Promise.all([
    deps.market.listDailyClosesSince(symbol, fiveYearsBack, date),
    deps.market.listTaiexClosesSince(fiveYearsBack, date),
    deps.market.getEarliestTradeDate(symbol),
  ]);

  if (earliestTradeDate === null) return skippedNoTradeDate;

  const indexByDate = new Map<string, number>();
  for (const row of indexRows) {
    if (row.close !== null) indexByDate.set(toDateString(row.trade_date), Number(row.close));
  }
  const overlap: OverlapPoint[] = [];
  for (const row of stockRows) {
    if (row.close === null) continue;
    const dateStr = toDateString(row.trade_date);
    const indexClose = indexByDate.get(dateStr);
    if (indexClose !== undefined) {
      overlap.push({ tradeDate: dateStr, stockClose: Number(row.close), indexClose });
    }
  }

  if (overlap.length === 0) return skippedNoTradeDate;

  const effectiveAsOf = overlap[overlap.length - 1]!.tradeDate;
  const effectiveAsOfDate = new Date(`${effectiveAsOf}T00:00:00.000Z`);
  const { knowledgeDate } = resolveDailyCadenceKnowledgeDate(effectiveAsOfDate);

  const coordinateFor = (lookbackRange: LookbackRange, samplingInterval: SamplingInterval) => ({
    symbol,
    metricCode: 'beta',
    ...rollingWindowGroup(lookbackRange, samplingInterval),
    dataType,
    subsidiaryCompanyId,
    tradeDate: effectiveAsOfDate,
  });

  const outcomes = {} as Record<BetaWindowConfig['outputKey'], ComputationSlot>;
  for (const config of BETA_WINDOW_CONFIGS) {
    const { value, nullReason } = calculateBetaWindow(overlap, effectiveAsOfDate, config);
    outcomes[config.outputKey] = computation({
      ...coordinateFor(config.lookbackRange, config.samplingInterval),
      value,
      nullReason,
      knowledgeDate,
      knowledgeDateIsFallback: false,
    });
  }

  return { symbol, tradeDate: effectiveAsOf, slots: { beta1YDaily: outcomes.beta1YDaily, beta2YWeekly: outcomes.beta2YWeekly, beta3YWeekly: outcomes.beta3YWeekly, beta5YMonthly: outcomes.beta5YMonthly } };
};
