import { z } from 'zod';
import { getMetricHistory, type MetricHistoryDeps } from '../queryMetricHistory';
import type { PeriodType } from '../../../../domain/metrics/metricBasis';

const nullReasonSchema = z.enum(['missing_input', 'zero_or_negative_denominator', 'not_applicable_industry', 'insufficient_history']).nullable();

export const dupontHistoryEntrySchema = z.object({
  fiscalYear: z.number().meta({ description: '西元年（民國+1911）' }),
  fiscalQuarter: z.number().nullable(),
  netProfitMarginPct: z.number().nullable().meta({ description: '稅後淨利率百分比' }),
  assetTurnover: z.number().nullable().meta({ description: '總資產週轉率（次）' }),
  equityMultiplier: z.number().nullable().meta({ description: '權益乘數；資產負債表時點快照，沒有獨立的 TTM 儲存值，periodType=TTM 時直接沿用同一期(fiscalYear/fiscalQuarter)的 Q 快照值——這正是 dupontDecomposedRoe(TTM)/dupontExtendedRoe(TTM) 內部計算時實際使用的同一個數字，不是另外估算' }),
  decomposedRoePct: z.number().nullable().meta({ description: '三因子杜邦拆解組裝出來的 ROE 百分比 = netProfitMarginPct x assetTurnover x equityMultiplier' }),
  nullReason: nullReasonSchema.meta({ description: 'decomposedRoePct 為 null 時的原因；其餘因子各自缺漏的細節請對照三個 metric_code 各自的資料，這裡不重複列出' }),
  // 2026-09-07 新增：五因子 Extended DuPont，把上面 netProfitMarginPct 再拆成稅務負擔×
  // 利息負擔×EBIT利潤率三層，見 computeDupontFamilyPit.ts 檔頭說明。dupontExtendedRoePct
  // 理論上等於 decomposedRoePct（已用真實資料驗證過一致），但兩者的 TTM 完整度判斷
  // 是分開的（五因子額外需要稅前淨利/財務費用，缺任一季就只有五因子這邊變成 null，三因子
  // 不受影響）——所以用獨立的 dupontExtendedRoeNullReason，不能假設兩個 nullReason
  // 一定一樣。
  dupontTaxBurdenPct: z.number().nullable().meta({ description: '稅務負擔 = 淨利/稅前淨利*100' }),
  dupontInterestBurdenPct: z.number().nullable().meta({ description: '利息負擔 = 稅前淨利/EBIT*100（EBIT=稅前淨利+財務費用）' }),
  dupontEbitMarginPct: z.number().nullable().meta({
    description: 'EBIT利潤率 = EBIT/營收*100（EBIT=稅前淨利+財務費用）；跟既有 operatingMargin（=operatingIncome/營收）是不同的數字，operatingIncome 嚴格排除非營業損益，這裡的 EBIT 只加回財務費用',
  }),
  dupontExtendedRoePct: z
    .number()
    .nullable()
    .meta({ description: '五因子杜邦拆解組裝出來的 ROE 百分比 = dupontTaxBurdenPct x dupontInterestBurdenPct x dupontEbitMarginPct x assetTurnover x equityMultiplier，理論上等於 decomposedRoePct' }),
  dupontExtendedRoeNullReason: nullReasonSchema.meta({ description: 'dupontExtendedRoePct 為 null 時的原因，跟 nullReason（三因子）分開判斷，兩者不一定一致' }),
  knowledgeDate: z.string().meta({ description: '這一期資料最早可被市場知道的日期（YYYY-MM-DD），這批 metric_code 共用同一次解析結果' }),
  knowledgeDateIsFallback: z.boolean().meta({ description: 'true 代表 knowledgeDate 是用財報期末日頂替（查無真實公告日）' }),
});
export type DupontHistoryEntry = z.infer<typeof dupontHistoryEntrySchema>;

const periodKey = (row: { fiscalYear: number; fiscalQuarter: number | null }): string => `${row.fiscalYear}-${row.fiscalQuarter}`;

// Dupont 拆解組合端點：只做這批遷移嚴格需要的最小集合（netProfitMargin/assetTurnover 兩個
// 因子 + equityMultiplier + 組裝出來的 decomposedRoe），不是完整的毛利率/週轉率家族——
// 這兩個因子刻意不單獨開歷史查詢端點（見 src/domainPitMetrics/queryMetricHistory.ts 旁的規劃
// 討論），只在這支組合端點裡曝露。
//
// 2026-09-13 修正：equityMultiplier 過去在 periodType='TTM' 時完全不查、恆回 null（web-nuxt
// 杜邦分析卡片把權益乘數改成主角線之後，TTM 檢視下整條線消失，回報過來才發現）。查證後
// 發現這是不必要的限制——equityMultiplier 只有 Q 一種儲存 basis 沒錯（它是資產負債表
// 時點快照，沒有「近四季加總」的概念，跟 netProfitMargin/assetTurnover 這類 flow 型因子
// 不同），但 computeDupontFamilyPit.ts 內部計算 dupontDecomposedRoe(TTM)/
// dupontExtendedRoe(TTM) 時，本來就是拿同一期（相同 fiscalYear/fiscalQuarter）的 Q 快照值
// 當權益乘數因子代入（analyst 界 TTM 杜邦拆解的標準做法：flow 型因子加總、balance-sheet
// 快照型因子維持期末值，不是巧合，是刻意設計，只是沒有同時曝露成獨立可查的 TTM 列）。
// 既然 TTM 分解的數學本來就用了這個值，這裡查詢時也一律 join 同一期的 Q 快照
// （不管呼叫端要的是 Q 還是 TTM basis），不用另外在 metric_values 多寫一份「TTM」列——
// 兩個 periodType 分解出來的 equityMultiplier 本來就該是同一個數字。
//
// 四個 metric_code 是同一次 computeAndWriteDupontFamilyPit() 呼叫共用同一組
// knowledge_date 寫入的，正常情況下同一期的 knowledgeDate 會一致；這裡以 netProfitMargin
// 那組的 knowledgeDate 當代表，只有極端情況（部分回補）才會不一致，不特別處理那種邊界情況。
export interface DupontHistoryResult {
  entries: DupontHistoryEntry[];
  total: number;
  hasMore: boolean;
}

export const getDupontHistory = async (symbol: string, periodType: PeriodType, limit: number, deps: MetricHistoryDeps): Promise<DupontHistoryResult> => {
  const [netProfitMarginResult, assetTurnoverResult, decomposedRoeResult, equityMultiplierResult, taxBurdenResult, interestBurdenResult, ebitMarginResult, extendedRoeResult] = await Promise.all([
    getMetricHistory(symbol, 'netProfitMargin', periodType, '2', '', limit, deps),
    getMetricHistory(symbol, 'assetTurnover', periodType, '2', '', limit, deps),
    getMetricHistory(symbol, 'dupontDecomposedRoe', periodType, '2', '', limit, deps),
    getMetricHistory(symbol, 'equityMultiplier', 'Q', '2', '', limit, deps),
    getMetricHistory(symbol, 'dupontTaxBurden', periodType, '2', '', limit, deps),
    getMetricHistory(symbol, 'dupontInterestBurden', periodType, '2', '', limit, deps),
    getMetricHistory(symbol, 'dupontEbitMargin', periodType, '2', '', limit, deps),
    getMetricHistory(symbol, 'dupontExtendedRoe', periodType, '2', '', limit, deps),
  ]);
  const netProfitMarginRows = netProfitMarginResult.entries;
  const assetTurnoverRows = assetTurnoverResult.entries;
  const decomposedRoeRows = decomposedRoeResult.entries;
  const equityMultiplierRows = equityMultiplierResult.entries;
  const taxBurdenRows = taxBurdenResult.entries;
  const interestBurdenRows = interestBurdenResult.entries;
  const ebitMarginRows = ebitMarginResult.entries;
  const extendedRoeRows = extendedRoeResult.entries;

  const netProfitMarginByPeriod = new Map(netProfitMarginRows.map((row) => [periodKey(row), row]));
  const assetTurnoverByPeriod = new Map(assetTurnoverRows.map((row) => [periodKey(row), row]));
  const decomposedRoeByPeriod = new Map(decomposedRoeRows.map((row) => [periodKey(row), row]));
  const equityMultiplierByPeriod = new Map(equityMultiplierRows.map((row) => [periodKey(row), row]));
  const taxBurdenByPeriod = new Map(taxBurdenRows.map((row) => [periodKey(row), row]));
  const interestBurdenByPeriod = new Map(interestBurdenRows.map((row) => [periodKey(row), row]));
  const ebitMarginByPeriod = new Map(ebitMarginRows.map((row) => [periodKey(row), row]));
  const extendedRoeByPeriod = new Map(extendedRoeRows.map((row) => [periodKey(row), row]));

  const periods = new Map<string, { fiscalYear: number; fiscalQuarter: number | null }>();
  for (const row of [...netProfitMarginRows, ...assetTurnoverRows, ...decomposedRoeRows, ...extendedRoeRows]) {
    periods.set(periodKey(row), { fiscalYear: row.fiscalYear, fiscalQuarter: row.fiscalQuarter });
  }

  const sortedPeriods = [...periods.values()].sort((a, b) => a.fiscalYear - b.fiscalYear || (a.fiscalQuarter ?? 0) - (b.fiscalQuarter ?? 0));

  const entries = sortedPeriods.slice(-limit).map((period) => {
    const key = periodKey(period);
    const netProfitMargin = netProfitMarginByPeriod.get(key) ?? null;
    const assetTurnover = assetTurnoverByPeriod.get(key) ?? null;
    const decomposedRoe = decomposedRoeByPeriod.get(key) ?? null;
    const equityMultiplier = equityMultiplierByPeriod.get(key) ?? null;
    const taxBurden = taxBurdenByPeriod.get(key) ?? null;
    const interestBurden = interestBurdenByPeriod.get(key) ?? null;
    const ebitMargin = ebitMarginByPeriod.get(key) ?? null;
    const extendedRoe = extendedRoeByPeriod.get(key) ?? null;
    // 代表性 knowledgeDate 取 netProfitMargin 那組，缺列時退回其他任一組有值的。
    const representative = netProfitMargin ?? assetTurnover ?? decomposedRoe ?? extendedRoe;

    return {
      fiscalYear: period.fiscalYear,
      fiscalQuarter: period.fiscalQuarter,
      netProfitMarginPct: netProfitMargin?.value ?? null,
      assetTurnover: assetTurnover?.value ?? null,
      equityMultiplier: equityMultiplier?.value ?? null,
      decomposedRoePct: decomposedRoe?.value ?? null,
      nullReason: decomposedRoe?.nullReason ?? null,
      dupontTaxBurdenPct: taxBurden?.value ?? null,
      dupontInterestBurdenPct: interestBurden?.value ?? null,
      dupontEbitMarginPct: ebitMargin?.value ?? null,
      dupontExtendedRoePct: extendedRoe?.value ?? null,
      dupontExtendedRoeNullReason: extendedRoe?.nullReason ?? null,
      knowledgeDate: representative?.knowledgeDate ?? '',
      knowledgeDateIsFallback: representative?.knowledgeDateIsFallback ?? false,
    };
  });

  // netProfitMargin/assetTurnover/dupontDecomposedRoe/dupontTaxBurden/dupontInterestBurden/
  // dupontEbitMargin/dupontExtendedRoe 七個 metric_code 是同一次
  // computeAndWriteDupontFamilyPit() 呼叫共用同一組座標寫入的，total 理論上會一致；
  // 代表性總數取 netProfitMargin 那組，跟上面 knowledgeDate 的代表性選擇同一個邏輯。
  const total = netProfitMarginResult.total;
  return { entries, total, hasMore: total > entries.length };
};
