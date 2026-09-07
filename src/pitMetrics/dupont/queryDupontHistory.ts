import { z } from 'zod';
import { getMetricHistory, type MetricHistoryResult } from '../queryMetricHistory';

const nullReasonSchema = z.enum(['missing_input', 'zero_or_negative_denominator', 'not_applicable_industry', 'insufficient_history']).nullable();

export const dupontHistoryEntrySchema = z.object({
  fiscalYear: z.number().meta({ description: '西元年（民國+1911）' }),
  fiscalQuarter: z.number().nullable(),
  netProfitMarginPct: z.number().nullable().meta({ description: '稅後淨利率百分比' }),
  assetTurnover: z.number().nullable().meta({ description: '總資產週轉率（次）' }),
  equityMultiplier: z.number().nullable().meta({ description: '權益乘數；basis=TTM 時恆為 null（權益乘數是資產負債表時點快照，沒有 TTM 變體，Q/TTM 拆解共用同一個 Q 快照值）' }),
  decomposedRoePct: z.number().nullable().meta({ description: '杜邦拆解組裝出來的 ROE 百分比 = netProfitMarginPct x assetTurnover x equityMultiplier' }),
  nullReason: nullReasonSchema.meta({ description: 'decomposedRoePct 為 null 時的原因；其餘因子各自缺漏的細節請對照三個 metric_code 各自的資料，這裡不重複列出' }),
  knowledgeDate: z.string().meta({ description: '這一期資料最早可被市場知道的日期（YYYY-MM-DD），四個 metric_code 共用同一次解析結果' }),
  knowledgeDateIsFallback: z.boolean().meta({ description: 'true 代表 knowledgeDate 是用財報期末日頂替（查無真實公告日）' }),
});
export type DupontHistoryEntry = z.infer<typeof dupontHistoryEntrySchema>;

const periodKey = (row: { fiscalYear: number; fiscalQuarter: number | null }): string => `${row.fiscalYear}-${row.fiscalQuarter}`;

// Dupont 拆解組合端點：只做這批遷移嚴格需要的最小集合（netProfitMargin/assetTurnover 兩個
// 因子 + equityMultiplier + 組裝出來的 decomposedRoe），不是完整的毛利率/週轉率家族——
// 這兩個因子刻意不單獨開歷史查詢端點（見 src/pitMetrics/queryMetricHistory.ts 旁的規劃
// 討論），只在這支組合端點裡曝露。basis='TTM' 時 equityMultiplier 恆為 null（見上方 schema
// 註解）。四個 metric_code 是同一次 computeAndWriteDupontFamilyPit() 呼叫共用同一組
// knowledge_date 寫入的，正常情況下同一期的 knowledgeDate 會一致；這裡以 netProfitMargin
// 那組的 knowledgeDate 當代表，只有極端情況（部分回補）才會不一致，不特別處理那種邊界情況。
export interface DupontHistoryResult {
  entries: DupontHistoryEntry[];
  total: number;
  hasMore: boolean;
}

const EMPTY_METRIC_HISTORY: MetricHistoryResult = { entries: [], total: 0, hasMore: false };

export const getDupontHistory = async (symbol: string, basis: 'Q' | 'TTM', limit: number): Promise<DupontHistoryResult> => {
  const [netProfitMarginResult, assetTurnoverResult, decomposedRoeResult, equityMultiplierResult] = await Promise.all([
    getMetricHistory(symbol, 'netProfitMargin', basis, '2', '', limit),
    getMetricHistory(symbol, 'assetTurnover', basis, '2', '', limit),
    getMetricHistory(symbol, 'dupontDecomposedRoe', basis, '2', '', limit),
    basis === 'Q' ? getMetricHistory(symbol, 'equityMultiplier', 'Q', '2', '', limit) : Promise.resolve(EMPTY_METRIC_HISTORY),
  ]);
  const netProfitMarginRows = netProfitMarginResult.entries;
  const assetTurnoverRows = assetTurnoverResult.entries;
  const decomposedRoeRows = decomposedRoeResult.entries;
  const equityMultiplierRows = equityMultiplierResult.entries;

  const netProfitMarginByPeriod = new Map(netProfitMarginRows.map((row) => [periodKey(row), row]));
  const assetTurnoverByPeriod = new Map(assetTurnoverRows.map((row) => [periodKey(row), row]));
  const decomposedRoeByPeriod = new Map(decomposedRoeRows.map((row) => [periodKey(row), row]));
  const equityMultiplierByPeriod = new Map(equityMultiplierRows.map((row) => [periodKey(row), row]));

  const periods = new Map<string, { fiscalYear: number; fiscalQuarter: number | null }>();
  for (const row of [...netProfitMarginRows, ...assetTurnoverRows, ...decomposedRoeRows]) {
    periods.set(periodKey(row), { fiscalYear: row.fiscalYear, fiscalQuarter: row.fiscalQuarter });
  }

  const sortedPeriods = [...periods.values()].sort((a, b) => a.fiscalYear - b.fiscalYear || (a.fiscalQuarter ?? 0) - (b.fiscalQuarter ?? 0));

  const entries = sortedPeriods.slice(-limit).map((period) => {
    const key = periodKey(period);
    const netProfitMargin = netProfitMarginByPeriod.get(key) ?? null;
    const assetTurnover = assetTurnoverByPeriod.get(key) ?? null;
    const decomposedRoe = decomposedRoeByPeriod.get(key) ?? null;
    const equityMultiplier = basis === 'Q' ? (equityMultiplierByPeriod.get(key) ?? null) : null;
    // 代表性 knowledgeDate 取 netProfitMargin 那組，缺列時退回其他任一組有值的。
    const representative = netProfitMargin ?? assetTurnover ?? decomposedRoe;

    return {
      fiscalYear: period.fiscalYear,
      fiscalQuarter: period.fiscalQuarter,
      netProfitMarginPct: netProfitMargin?.value ?? null,
      assetTurnover: assetTurnover?.value ?? null,
      equityMultiplier: equityMultiplier?.value ?? null,
      decomposedRoePct: decomposedRoe?.value ?? null,
      nullReason: decomposedRoe?.nullReason ?? null,
      knowledgeDate: representative?.knowledgeDate ?? '',
      knowledgeDateIsFallback: representative?.knowledgeDateIsFallback ?? false,
    };
  });

  // netProfitMargin/assetTurnover/dupontDecomposedRoe 三個 metric_code 是同一次
  // computeAndWriteDupontFamilyPit() 呼叫共用同一組座標寫入的，total 理論上會一致；
  // 代表性總數取 netProfitMargin 那組，跟上面 knowledgeDate 的代表性選擇同一個邏輯。
  const total = netProfitMarginResult.total;
  return { entries, total, hasMore: total > entries.length };
};
