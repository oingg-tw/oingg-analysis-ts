import { pickNetIncomeWithFieldKey as pickNetIncome } from '@/domain/metrics/shared/pickers';
import { rocYearToGregorian } from '@/domain/calendar/rocQuarter';
import { trailingPeriodLabel } from '../../shared/trailingYear';
import type { QuarterlyMetricQuery } from '@/domain/financials/quarterlyMetric';
import { toProvenanceEntryValue, type MetricProvenanceResult, type ProvenanceEntry } from '../../shared/provenance/provenanceTypes';
import { resolveOhlsonOScoreInputs, type OhlsonOScoreDeps } from './computeOhlsonOScore';

// 2026-09-13 使用者要求擴大稽核鏈——Ohlson O-Score 是 9 變數 Logit 模型，見 computeOhlsonOScore.ts 的完整公式。這支稽核鏈
// 列出真正的原始欄位（本季資產負債表快照 + 今年近一年淨利 + 去年同期近一年淨利 + 今年近一年營業現金流），9 個中繼變數在
// methodologyNote 說明算出來的值，不逐一拆成 entries（都是原始欄位的組合，硬拆只會讓 entries 難以閱讀）。只算原始分數，
// 不套用金融業排除（那是寫入路徑的政策決定，跟 altmanZScore／zmijewskiScore 的溯源表同一個模式）。固定回傳 TTM。
//
// 2026-10-01 改成跟 computeOhlsonOScore 共用 resolveOhlsonOScoreInputs：原本這裡自己重算，SIZE 還停在 v1 的 ln(新台幣千元)，
// 沒跟上 2026-09-22 v2 的「× 1000 ÷ 美元匯率 ÷ (GNPDEF ÷ 1968 基期 × 100)」，全市場固定差約 −1.28。值直接取
// resolution.oScore（金融業排除之前的原始分數）；SIZE 用到的匯率與物價指數以 type 'other' 列出。

export const getOhlsonOScoreProvenance = async (query: QuarterlyMetricQuery, deps: OhlsonOScoreDeps): Promise<MetricProvenanceResult> => {
  const r = await resolveOhlsonOScoreInputs(query, deps);

  if (!r) {
    return { symbol: query.symbol, metricCode: 'ohlsonOScore', found: false, fiscalYear: null, fiscalQuarter: null, value: null, entries: [], methodologyNote: null };
  }

  const { fiscalYear, seasonNum } = r;
  const balance = (role: string, fieldKey: string, value: bigint | null): ProvenanceEntry => ({
    role, fiscalYear, fiscalQuarter: seasonNum, type: 'statementField', statementType: 'balanceSheet', fieldKey, sourceDescription: null, value: toProvenanceEntryValue(value),
  });
  const other = (role: string, value: number | null, sourceDescription: string): ProvenanceEntry => ({
    role, fiscalYear, fiscalQuarter: seasonNum, type: 'other', statementType: null, fieldKey: null, sourceDescription, value: toProvenanceEntryValue(value),
  });
  const netIncomeEntries = (label: string, trailing: typeof r.thisYearIncome): ProvenanceEntry[] =>
    trailing.periods.map((tq): ProvenanceEntry => {
      const netIncome = pickNetIncome(tq.record);
      return {
        role: `${label}（${trailingPeriodLabel(tq, trailing.basis)}）`,
        fiscalYear: rocYearToGregorian(Number(tq.year)),
        fiscalQuarter: Number(tq.season),
        type: 'statementField',
        statementType: 'incomeStatement',
        fieldKey: netIncome.fieldKey,
        sourceDescription: null,
        value: toProvenanceEntryValue(netIncome.value),
      };
    });

  const entries: ProvenanceEntry[] = [
    balance('本季期末總資產', 'assets', r.totalAssets),
    balance('本季期末總負債', 'liabilities', r.totalLiabilities),
    balance('本季期末流動資產', 'current_assets', r.currentAssets),
    balance('本季期末流動負債', 'current_liabilities', r.currentLiabilities),
    other(`美元兌新台幣匯率（SIZE 用：總資產換成美元；季底 ${r.priceLevelDate.toISOString().slice(0, 10)} 當天或之前最近一筆）`, r.usdTwd, '中央銀行新台幣對美元銀行間收盤匯率（央行統計資料庫 EG51D01）'),
    other(`美國 GNP 平減指數（SIZE 用：${fiscalYear} 年第 ${seasonNum} 季，2017=100）`, r.deflator, 'FRED GNPDEF（https://fred.stlouisfed.org/series/GNPDEF）'),
    other('美國 GNP 平減指數 1968 年四季平均（SIZE 用：Ohlson 原文的基期，換算成 1968=100）', r.deflatorBase, 'FRED GNPDEF（https://fred.stlouisfed.org/series/GNPDEF）'),
    ...netIncomeEntries('今年 近一年 淨利', r.thisYearIncome),
    ...netIncomeEntries('去年同期 近一年 淨利（用於 INTWO/CHIN）', r.priorYearIncome),
    ...r.thisYearCashFlow.periods.map(
      (tq): ProvenanceEntry => ({
        role: `今年 近一年 營業活動現金流（${trailingPeriodLabel(tq, r.thisYearCashFlow.basis)}，用於 FUTL）`,
        fiscalYear: rocYearToGregorian(Number(tq.year)),
        fiscalQuarter: Number(tq.season),
        type: 'statementField',
        statementType: 'cashFlowStatement',
        fieldKey: 'cash_flows_from_used_in_operating_activities',
        sourceDescription: null,
        value: toProvenanceEntryValue(tq.record?.netCashFromOperatingActivities ?? null),
      })
    ),
  ];

  const { size, tlta, wcta, clca, oeneg, nita, futl, intwo, chin } = r.variables;
  return {
    symbol: r.symbol,
    metricCode: 'ohlsonOScore',
    found: true,
    fiscalYear,
    fiscalQuarter: seasonNum,
    value: r.oScore,
    entries,
    methodologyNote:
      'O = -1.32 -0.407×SIZE +6.03×TLTA -1.43×WCTA +0.0757×CLCA -1.72×OENEG -2.37×NITA -1.83×FUTL +0.285×INTWO -0.521×CHIN。' +
      `SIZE(ln(總資產千元×1000 ÷ 美元匯率 ÷ (本季 GNP 平減指數 ÷ 1968 基期 × 100))，照 Ohlson 1980 原文以美元、1968=100 物價計)＝${size ?? 'null'}、` +
      `TLTA(總負債/總資產)＝${tlta ?? 'null'}、WCTA((流動資產-流動負債)/總資產)＝${wcta ?? 'null'}、` +
      `CLCA(流動負債/流動資產)＝${clca ?? 'null'}、OENEG(總負債>總資產記1否則0)＝${oeneg ?? 'null'}、NITA(淨利TTM/總資產)＝${nita ?? 'null'}、` +
      `FUTL(營業現金流TTM/總負債)＝${futl ?? 'null'}、INTWO(今年去年同期淨利TTM皆為負記1)＝${intwo ?? 'null'}、` +
      `CHIN((今年淨利TTM-去年同期)/(|今年|+|去年同期|))＝${chin ?? 'null'}。這 9 個中繼變數都是上方原始欄位組合出來的，本身不是財報原始欄位，未套用金融業排除（那是寫入路徑另外決定的政策，見 metric-history 的 nullReason）。`,
  };
};
