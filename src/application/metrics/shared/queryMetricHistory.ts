import { z } from 'zod';
import type { AppDeps } from '@/application/deps';
import type { PeriodType } from '../../../domain/metrics/metricBasis';

// 讀取端 use case 共用的 deps 形狀——2026-09-17 Phase 4 起歷史查詢改透過 MetricValueQueryPort 注入，
// 不再靜態 import infrastructure 的 repository。
// 2026-09-22 加 reportAvailability：讀取端不再寫死 dataType '2'，每家公司的口徑由 port 決定（見 ports/reportAvailability.ts）。
export type MetricHistoryDeps = Pick<AppDeps, 'metricValueQueries' | 'reportAvailability'>;

export const metricHistoryEntrySchema = z.object({
  fiscalYear: z.number().meta({ description: '西元年（民國+1911）' }),
  fiscalQuarter: z.number().nullable(),
  // 2026-09-09 新增，選填——逐日型指標（見 queryDailyCadenceMetricHistory.ts）額外帶
  // 這個欄位給需要精確到天的呼叫端用；季報型指標（這支函式）不填。additive，不影響既有
  // 只讀 fiscalYear/fiscalQuarter 的消費端。
  tradeDate: z.string().optional().meta({ description: '逐日型指標專用（YYYY-MM-DD），季報型指標不會有這個欄位' }),
  value: z.number().nullable().meta({ description: '這期算出來的數字；null 代表這期算不出來，原因見 nullReason' }),
  nullReason: z
    .enum(['missing_input', 'zero_or_negative_denominator', 'not_applicable_industry', 'insufficient_history'])
    .nullable()
    .meta({ description: 'value 為 null 時的原因；value 非 null 時一律是 null' }),
  knowledgeDate: z.string().meta({
    description:
      '這個值最早可被市場知道的日期（YYYY-MM-DD）。注意這不是「最後更新時間」，不能當快取鍵——公式改版重算時值會被改寫、但 knowledgeDate 不變（2026-09-23 杜邦分母改成期間平均，2330 的 2022Q4 從 34.91 變成 40.14，knowledgeDate 仍是 2023-02-14）。我們重算後會主動通知下游清快取。',
  }),
  knowledgeDateIsFallback: z
    .boolean()
    .meta({ description: 'true 代表 knowledgeDate 是用財報期末日頂替（查無真實公告日），有 look-ahead bias 風險，前端可考慮標示' }),
  dataType: z.enum(['1', '2']).optional().meta({ description: "這一期的財報口徑：'2' 合併報表、'1' 個體報表（2026-09-27 新增，web-nuxt 要求）。同一家公司的歷史可能在某一期從 '2' 換成 '1'——合併報表停掉、之後只編個體報表的公司（處分子公司後），前端在轉換期標註用。季報型指標（Q/TTM/FY）每一家每一期都有（一般公司恆為 '2'、只申報個體的公司恆為 '1'）；只有逐日型指標沒有這個欄位。" }),
  formulaVersion: z.number().int().meta({ description: '2026-09-26 新增：這個值是用第幾版公式算的（metric_values.formula_version）。GET /metrics 同一支指標的 formulaVersion 是「目前的算法版本」；兩者不一致代表這個值以較舊的算法計算、還沒重算到——仍是自洽的結果，可以正常顯示，但不應快取。重算完成後兩者會一致。' }),
});
export type MetricHistoryEntry = z.infer<typeof metricHistoryEntrySchema>;

export interface MetricHistoryResult {
  entries: MetricHistoryEntry[];
  // 這個 symbol/metricCode/periodType 去重後總共有幾期資料（不受 limit 影響）——前端可以
  // 拿這個數字決定要不要提供「看更長區間」的選項（例如完整歷史只有 6 年，就不要讓使用者
  // 點下「近 10 年」，點了也只會拿到一樣的 6 年資料）。
  total: number;
  // = total > entries.length，等同於「還有更早的資料沒有回傳」；entries 固定是「最近 N
  // 期」，往前翻頁目前還做不到（見 abstract-crafting-journal.md 的相關規劃），這個欄位
  // 至少讓前端知道「有更多」跟「這就是全部」的差別。
  hasMore: boolean;
}

// 從 src/domainPitMetrics/profitability/roe/queryRoeHistory.ts 抽出來的通用版本：任何單一
// metric_code 查 metric_values 歷史時序都走這支，不用每支指標各自重寫一次「依
// (fiscalYear,fiscalQuarter) 去重取最大 knowledge_date、切 limit、反轉成舊到新」的邏輯。
// live 語意：同一個座標如果有多筆（重編疊加），只取 knowledge_date 最大的那筆，符合
// docs/analysis-ts-spec-v0.2.md §4.4「live 端點一律隱含取每組最大 knowledge_date」語義。
//
// 2026-09-09：這支函式現在是純季報型（metric_values 拆表後只剩 periodType 一組 basis
// 相關欄位，逐日型指標搬到 metric_daily_cadence_values，見
// src/domainPitMetrics/queryDailyCadenceMetricHistory.ts）——原本這裡收「四欄位 basisGroup」
// 的抽象是為了同時容納三種形狀，拆表後只剩一種形狀，抽象不再需要，直接收單一
// periodType 參數。
export const getMetricHistory = async (
  symbol: string,
  metricCode: string,
  periodType: PeriodType,
  dataType: '1' | '2',
  subsidiaryCompanyId: string,
  limit: number,
  deps: MetricHistoryDeps
): Promise<MetricHistoryResult> => {
  // 2026-09-27 財報口徑按期別決定（domain/financials/reportDataType.ts）：dataType 是最新一期的口徑，另一種口徑也查，
  // 每一期只留「那一期該用的口徑」的列，歷史接起來——改只編個體報表的公司（1727 合併到 113Q4、個體 114Q1 起）才看得到完整序列。
  // 一般公司另一種口徑查回空陣列，結果跟以前一樣。
  const otherType = dataType === '1' ? '2' : '1';
  const [primary, secondary] = await Promise.all([
    deps.metricValueQueries.listPeriodMetricHistoryRows(symbol, metricCode, periodType, dataType, subsidiaryCompanyId),
    deps.metricValueQueries.listPeriodMetricHistoryRows(symbol, metricCode, periodType, otherType, subsidiaryCompanyId),
  ]);
  const keepForPeriod = async (list: typeof primary, type: '1' | '2') => {
    const keep = await Promise.all(list.map(async (row) => (await deps.reportAvailability.resolveDataTypeForPeriod(symbol, row.fiscalYear - 1911, row.fiscalQuarter ?? 4)) === type));
    return list.filter((_, i) => keep[i]);
  };
  const tag = (list: typeof primary, type: '1' | '2') => list.map((row) => ({ ...row, dataType: type }));
  const rows = secondary.length === 0 ? tag(primary, dataType) : [...tag(await keepForPeriod(primary, dataType), dataType), ...tag(await keepForPeriod(secondary, otherType), otherType)].sort(
    (a, b) => b.fiscalYear - a.fiscalYear || (b.fiscalQuarter ?? 0) - (a.fiscalQuarter ?? 0) || b.knowledgeDate.getTime() - a.knowledgeDate.getTime()
  );

  const latestPerPeriod = new Map<string, (typeof rows)[number]>();
  for (const row of rows) {
    const key = `${row.fiscalYear}-${row.fiscalQuarter}`;
    if (!latestPerPeriod.has(key)) latestPerPeriod.set(key, row);
  }

  const allPeriods = [...latestPerPeriod.values()];
  const total = allPeriods.length;

  const entries = allPeriods
    .slice(0, limit)
    .reverse() // 轉成由舊到新，方便前端直接畫時序圖
    .map((row) => ({
      fiscalYear: row.fiscalYear,
      fiscalQuarter: row.fiscalQuarter,
      value: row.value === null ? null : Number(row.value),
      nullReason: row.nullReason as MetricHistoryEntry['nullReason'],
      knowledgeDate: row.knowledgeDate.toISOString().slice(0, 10),
      knowledgeDateIsFallback: row.knowledgeDateIsFallback,
      dataType: row.dataType,
      formulaVersion: row.formulaVersion,
    }));

  return { entries, total, hasMore: total > entries.length };
};
