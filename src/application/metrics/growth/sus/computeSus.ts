import { calculateSus, SUS_WINDOW_MONTHS } from '@/domain/metrics/growth/sus/calculateSus';
import { monthlyGroup } from '@/domain/metrics/coordinate';
import { computation, type ComputationSlot, type MonthlyComputationBatch } from '@/domain/metrics/computation';
import type { StatementDataType } from '@/domain/financials/quarterlyMetric';
import type { PitDeps } from '@/application/metrics/deps';

// SUS（標準化未預期營收）的查詢與編排——純計算在 domain/metrics/growth/sus/calculateSus.ts。
//
// **knowledgeDate**：用該月營收的實際公告日（月營收來源的 report_date）。查不到時退回**次月 10 日**
// ——那是證交法規定的申報期限（每月 10 日前公告前一月營收）。這個 fallback 刻意選期限而不是「月底」：
// 月底早於實際公告日，用它會產生 look-ahead bias（回測會在還沒公告時就看到數字）；期限則是保守方向
// （宣稱我們比實際更晚知道），不會穿越未來。tpex 的歷史月份 report_date 全是 null（來源頁面的「出表
// 日期」是網頁重新產生的日期不是當年申報日，上游誠實留空），所以上櫃公司幾乎都會走這條 fallback。
//
// 這是本專案第一支月頻指標，座標是 (fiscalYear, fiscalMonth)、四個 basis 欄位全 'N/A'，寫進
// metric_monthly_values。
export type SusDeps = Pick<PitDeps, 'monthlyRevenue'>;

export interface MonthlyMetricQuery {
  symbol: string;
  yearMonth?: string; // "YYYY-MM"，不給就用該公司最新一個有營收的月份
  dataType: StatementDataType;
  subsidiaryCompanyId: string;
}

// 月營收金額欄位是 bigint 序列化的字串（單位千元），這裡轉 number——SUS 是比值，單位會被約掉，
// 而 60 個月的千元級數字遠在 Number.MAX_SAFE_INTEGER 內，不需要 bigint 運算。
const toRevenue = (raw: string | null): number | null => (raw === null ? null : Number(raw));

// "YYYY-MM" → 次月 10 日（UTC）。12 月會正確進位到隔年 1 月。
const statutoryDeadline = (yearMonth: string): Date => {
  const [year, month] = yearMonth.split('-').map(Number) as [number, number];
  return month === 12 ? new Date(Date.UTC(year + 1, 0, 10)) : new Date(Date.UTC(year, month, 10));
};

export const computeSus = async (query: MonthlyMetricQuery, deps: SusDeps): Promise<MonthlyComputationBatch<'sus'>> => {
  const { symbol, dataType, subsidiaryCompanyId } = query;

  // 一次拿完整歷史（目前上限 60 個月），自己在記憶體裡切窗口——比起讓 port 支援「某月往前 N 期」的
  // 查詢介面，這樣不用為單一指標擴充 port，而且回填時同一家公司的多個月份可以共用這一次查詢結果。
  const { entries } = await deps.monthlyRevenue.getMonthlyRevenueHistory(symbol, 600);

  const targetIndex = query.yearMonth ? entries.findIndex((e) => e.yearMonth === query.yearMonth) : entries.length - 1;
  if (targetIndex < 0 || entries.length === 0) {
    return { symbol, yearMonth: query.yearMonth ?? null, slots: { sus: { action: 'skipped_no_quarter' } } };
  }

  const target = entries[targetIndex]!;
  const [yearStr, monthStr] = target.yearMonth.split('-') as [string, string];

  // 窗口是「連續 21 個月」——用 entries 的位置切，但必須驗證中間沒有缺月（來源理論上逐月連續，
  // 不過新上市公司或上游補漏都可能造成跳月，靜默接受會算出錯的季節差分）。
  const start = targetIndex - (SUS_WINDOW_MONTHS - 1);
  const window = start >= 0 ? entries.slice(start, targetIndex + 1) : [];
  const isContiguous =
    window.length === SUS_WINDOW_MONTHS &&
    window.every((entry, i) => {
      if (i === 0) return true;
      const [py, pm] = window[i - 1]!.yearMonth.split('-').map(Number) as [number, number];
      const [cy, cm] = entry.yearMonth.split('-').map(Number) as [number, number];
      return cy * 12 + cm === py * 12 + pm + 1;
    });

  const result = isContiguous
    ? calculateSus(window.map((e) => toRevenue(e.currentMonthRevenue)))
    : ({ value: null, nullReason: 'insufficient_history' } as const);

  const knowledgeDate = target.reportDate ? new Date(`${target.reportDate}T00:00:00.000Z`) : statutoryDeadline(target.yearMonth);

  const slot: ComputationSlot = computation({
    symbol,
    metricCode: 'sus',
    fiscalYear: Number(yearStr),
    fiscalMonth: Number(monthStr),
    dataType,
    subsidiaryCompanyId,
    ...monthlyGroup(),
    value: result.value,
    nullReason: result.nullReason,
    knowledgeDate,
    knowledgeDateIsFallback: target.reportDate === null,
  });

  return { symbol, yearMonth: target.yearMonth, slots: { sus: slot } };
};
