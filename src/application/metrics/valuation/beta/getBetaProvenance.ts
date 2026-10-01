import { BETA_MIN_OBSERVATIONS, BETA_WINDOW_CONFIGS, calculateBetaWindow, selectBetaWindow, type BetaWindowConfig } from '@/domain/metrics/valuation/beta/calculateBeta';
import type { MetricProvenanceResult, ProvenanceEntry } from '../../shared/provenance/provenanceTypes';
import { loadBetaOverlap, type BetaDeps } from './computeBeta';

// 2026-10-01 補溯源表（使用者：「溯源表請務必都加上」）。beta 是逐日型，用 asOfDate 定位（該日或之前最近一個個股與大盤都有
// 收盤價的重疊交易日；不給就是最新），year/season 不適用。價格序列與對齊邏輯直接呼叫 computeBeta 同一支 loadBetaOverlap、
// 窗口切法呼叫同一支 selectBetaWindow／calculateBetaWindow，值跟寫入的那四列是同一個計算。
//
// 一個 metricCode 有四個窗口（1Y×1D／2Y×1W／3Y×1W／5Y×1M），溯源結果只能有一個 value：選 5Y×1M——徽章（betaBadge.timeframe
// = '5Y_1M'，Baker-Bradley-Wurgler 用 60 個月月報酬）就是看這個窗口，徽章專頁點進來的數字要對得上。另外三個窗口不丟掉，
// 跟 5Y×1M 一起逐一列在 entries（每個窗口一筆，role 寫起訖日與取樣點數），使用者在同一張表就能看到四個窗口的差異。
// 逐筆報酬率（1Y 日頻約 245 筆）不列——跟 sue 的 20 期標準差樣本同一個省略慣例，取樣點數與起訖日寫在 role 裡。
const HEADLINE_WINDOW: BetaWindowConfig['outputKey'] = 'beta5YMonthly';

const FREQUENCY_LABEL = { daily: '日頻', weekly: '週頻（每週最後一個重疊交易日）', monthly: '月頻（每月最後一個重疊交易日）' } as const;

const notFound = (symbol: string): MetricProvenanceResult => ({ symbol, metricCode: 'beta', found: false, fiscalYear: null, fiscalQuarter: null, value: null, entries: [], methodologyNote: null });

export const getBetaProvenance = async (query: { symbol: string; asOfDate?: Date | undefined }, deps: BetaDeps): Promise<MetricProvenanceResult> => {
  const { symbol } = query;
  const overlap = await loadBetaOverlap(symbol, query.asOfDate, deps);
  if (overlap === null || overlap.length === 0) return notFound(symbol);

  const base = overlap[overlap.length - 1]!;
  const baseDate = new Date(`${base.tradeDate}T00:00:00.000Z`);

  const windows = BETA_WINDOW_CONFIGS.map((config) => {
    const samples = selectBetaWindow(overlap, baseDate, config);
    return { config, samples, ...calculateBetaWindow(overlap, baseDate, config) };
  });

  const entries: ProvenanceEntry[] = [
    { role: `個股收盤價（基準日 ${base.tradeDate}）`, fiscalYear: null, fiscalQuarter: null, type: 'other', statementType: null, fieldKey: null, sourceDescription: '證交所／櫃買中心每日收盤價', value: base.stockClose },
    { role: `加權股價指數收盤（基準日 ${base.tradeDate}）`, fiscalYear: null, fiscalQuarter: null, type: 'other', statementType: null, fieldKey: null, sourceDescription: '臺灣證券交易所發行量加權股價指數（TAIEX）每日收盤', value: base.indexClose },
    ...windows.map(({ config, samples, value, observations }): ProvenanceEntry => {
      const range = samples.length > 0 ? `${samples[0]!.tradeDate}～${samples[samples.length - 1]!.tradeDate}` : '窗口內無重疊交易日';
      const headline = config.outputKey === HEADLINE_WINDOW ? '，本表數值' : '';
      return {
        role: `${config.years} 年${FREQUENCY_LABEL[config.frequency]} Beta（${config.lookbackRange}×${config.samplingInterval}，${range}，${observations} 個取樣點${headline}）`,
        fiscalYear: null,
        fiscalQuarter: null,
        type: 'other',
        statementType: null,
        fieldKey: null,
        sourceDescription: '個股與加權股價指數在窗口內的重疊交易日收盤價，降頻後算報酬率再迴歸',
        value,
      };
    }),
  ];

  const headline = windows.find((w) => w.config.outputKey === HEADLINE_WINDOW)!;
  return {
    symbol,
    metricCode: 'beta',
    found: true,
    fiscalYear: null,
    fiscalQuarter: null,
    value: headline.value,
    entries,
    methodologyNote:
      `Beta ＝ Cov(個股報酬率, 加權指數報酬率) ÷ Var(加權指數報酬率)，樣本共變異數／變異數（分母 n−1），四捨五入到小數 4 位。` +
      `基準日 ${base.tradeDate} 是個股與加權指數都有收盤價的最新重疊交易日；四個窗口各自從基準日往前取 N 年的重疊交易日再降頻，` +
      `相鄰兩個取樣點的收盤價算一期報酬率（取樣點數 − 1 期）。降頻後取樣點少於 ${BETA_MIN_OBSERVATIONS} 個不算（資料期間不足）。` +
      `本表數值是 5 年月頻（5Y×1M）窗口——徽章「貝他係數最低五分位」照 Baker、Bradley 與 Wurgler（2011）用 60 個月月報酬，看的就是這個窗口；其餘三個窗口列在上方供對照。`,
  };
};
