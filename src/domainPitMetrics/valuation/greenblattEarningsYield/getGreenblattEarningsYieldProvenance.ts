import type { QuarterlyMetricQuery } from '@/domain/financials/quarterlyMetric';
import { resolveGreenblattEarningsYieldInputs } from './computeGreenblattEarningsYieldPit';
import { toProvenanceEntryValue, type MetricProvenanceResult, type ProvenanceEntry, type ProvenanceMetricCode } from '../../shared/provenance/provenanceTypes';

// 2026-09-13 使用者要求擴大稽核鏈——greenblattEarningsYield(TTM) = 近四季 EBIT(=稅前
// 淨利+財務費用)加總 / EV(=市值+有息負債-現金及約當現金，本季期末)。跟
// computeGreenblattEarningsYieldPit.ts 共用同一個 resolveGreenblattEarningsYieldInputs
// （跟 accrualsRatio/greenblattRoc 的做法一致），現查現算不持久化。固定回傳 TTM。
//
// 2026-09-14：greenblattEarningsYield 已從 PILOT_PROVENANCE_METRIC_CODES／
// PROVENANCE_RESOLVERS 移除（見 provenanceTypes.ts 註解），這支函式不再被任何路由呼叫，
// 純粹保留邏輯供未來神奇公式合併使用。metricCode 字面量已不在窄化後的型別裡，用
// `as ProvenanceMetricCode` 讓它繼續編譯過，不影響任何執行期路徑。

export const getGreenblattEarningsYieldProvenance = async (query: QuarterlyMetricQuery): Promise<MetricProvenanceResult> => {
  const resolution = await resolveGreenblattEarningsYieldInputs(query);

  if (!resolution) {
    return {
      symbol: query.symbol,
      metricCode: 'greenblattEarningsYield' as ProvenanceMetricCode,
      found: false,
      fiscalYear: null,
      fiscalQuarter: null,
      value: null,
      entries: [],
      methodologyNote: null,
    };
  }

  const { symbol, fiscalYear, fiscalQuarter, marketCap, totalDebt, cashAndEquivalents, ttmQuarterDetails, earningsYieldTtm } = resolution;

  const entries: ProvenanceEntry[] = [
    { role: '市值（本季知識時點）', fiscalYear, fiscalQuarter, type: 'other', statementType: null, fieldKey: null, sourceDescription: '收盤價 × 流通股數', value: toProvenanceEntryValue(marketCap) },
    { role: '本季期末有息負債（短期借款+應付公司債+長期借款）', fiscalYear, fiscalQuarter, type: 'other', statementType: null, fieldKey: null, sourceDescription: '短期借款+應付公司債(非流動部分)+長期借款相加，非單一原始欄位', value: toProvenanceEntryValue(totalDebt) },
    { role: '本季期末現金及約當現金', fiscalYear, fiscalQuarter, type: 'statementField', statementType: 'balanceSheet', fieldKey: 'cash_and_cash_equivalents', sourceDescription: null, value: toProvenanceEntryValue(cashAndEquivalents) },
    ...ttmQuarterDetails.flatMap((detail, i): ProvenanceEntry[] => [
      {
        role: `TTM 稅前淨利（第 ${i + 1}/4 季，用於 EBIT）`,
        fiscalYear: detail.fiscalYear,
        fiscalQuarter: detail.season,
        type: 'statementField',
        statementType: 'incomeStatement',
        fieldKey: 'profit_loss_before_tax',
        sourceDescription: null,
        value: toProvenanceEntryValue(detail.profitBeforeTax),
      },
      {
        role: `TTM 財務費用（第 ${i + 1}/4 季，用於 EBIT）`,
        fiscalYear: detail.fiscalYear,
        fiscalQuarter: detail.season,
        type: 'statementField',
        statementType: 'incomeStatement',
        fieldKey: 'finance_costs',
        sourceDescription: null,
        value: toProvenanceEntryValue(detail.financeCosts),
      },
    ]),
  ];

  return {
    symbol,
    metricCode: 'greenblattEarningsYield' as ProvenanceMetricCode,
    found: true,
    fiscalYear,
    fiscalQuarter,
    value: earningsYieldTtm,
    entries,
    methodologyNote: `EV(企業價值) = 市值 + 有息負債 - 現金及約當現金，EV＝${resolution.marketCap !== null && totalDebt !== null && cashAndEquivalents !== null ? resolution.marketCap + Number(totalDebt) * 1000 - Number(cashAndEquivalents) * 1000 : 'null'}。EBIT 不是財報原始欄位，是稅前淨利+財務費用相加得出的中繼值。`,
  };
};
