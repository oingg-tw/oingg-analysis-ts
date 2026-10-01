import { rocYearToGregorian } from '@/domain/calendar/rocQuarter';
import { pickNetIncomeWithFieldKey } from '@/domain/metrics/shared/pickers';
import type { QuarterlyMetricQuery } from '@/domain/financials/quarterlyMetric';
import type { MarketCapAsOf } from '@/application/ports/marketData';
import { resolveOneDollarTestInputs, type OneDollarTestDeps } from './computeOneDollarTest';
import { trailingPeriodLabel } from '../../shared/trailingYear';
import { toProvenanceEntryValue, type MetricProvenanceResult, type ProvenanceEntry } from '../../shared/provenance/provenanceTypes';

// 2026-10-01 使用者要求溯源表全部補齊：oneDollarTest(FY) = 5 個完整會計年度的市值變化 ÷ 同期累計保留盈餘
// （淨利加總 − |股利發放加總|）。跟 computeOneDollarTest 共用 resolveOneDollarTestInputs，數字必然一致。
// 原始欄位逐年逐期列出（上市櫃每年四季、興櫃每年上下半年，標籤用 trailingPeriodLabel），期初／期末市值是
// 衍生值（股價 × 流通股數），用 type 'other'；累計保留盈餘是中繼值，放 methodologyNote。

const marketCapEntry = (role: string, rocYear: number, marketCap: MarketCapAsOf | null): ProvenanceEntry => ({
  role,
  fiscalYear: rocYearToGregorian(rocYear),
  fiscalQuarter: 4,
  type: 'other',
  statementType: null,
  fieldKey: null,
  sourceDescription: marketCap ? `收盤價 ${marketCap.closePrice}（${marketCap.tradeDate}）× 流通股數 ${marketCap.outstandingCommonShares.toString()}，單位元` : null,
  value: marketCap ? marketCap.marketCap : null,
});

export const getOneDollarTestProvenance = async (query: QuarterlyMetricQuery, deps: OneDollarTestDeps): Promise<MetricProvenanceResult> => {
  const resolution = await resolveOneDollarTestInputs(query, deps);

  if (!resolution) {
    return { symbol: query.symbol, metricCode: 'oneDollarTest', found: false, fiscalYear: null, fiscalQuarter: null, value: null, entries: [], methodologyNote: null };
  }

  const { symbol, fiscalYear, seasonNum, latestCompleteFiscalYear, baseFiscalYear, annualFigures, cumulativeNetIncome, dividendsAbs, cumulativeRetainedEarnings, currentMarketCap, baseMarketCap, value } = resolution;

  const flowEntries = annualFigures.flatMap(({ income, cashFlow }) =>
    income.periods.flatMap((p, i): ProvenanceEntry[] => {
      const label = trailingPeriodLabel(p, income.basis);
      const cashFlowRecord = cashFlow.periods[i]?.record ?? null;
      const netIncome = pickNetIncomeWithFieldKey(p.record);
      const at = { fiscalYear: rocYearToGregorian(Number(p.year)), fiscalQuarter: Number(p.season), sourceDescription: null };
      return [
        { role: `${label}：淨利（歸屬母公司優先，缺漏退回整體口徑）`, ...at, type: 'statementField', statementType: 'incomeStatement', fieldKey: netIncome.fieldKey, value: toProvenanceEntryValue(netIncome.value) },
        {
          role: `${label}：發放股利（原始資料是現金流出負值，缺漏視為 0）`,
          ...at,
          type: 'statementField',
          statementType: 'cashFlowStatement',
          fieldKey: cashFlowRecord?.dividendsPaidFieldKey ?? null,
          value: toProvenanceEntryValue(cashFlowRecord?.dividendsPaid),
        },
      ];
    })
  );

  return {
    symbol,
    metricCode: 'oneDollarTest',
    found: true,
    fiscalYear,
    fiscalQuarter: seasonNum,
    value,
    entries: [
      marketCapEntry(`期初市值（${baseFiscalYear} 年度第 4 季期末日）`, baseFiscalYear, baseMarketCap),
      marketCapEntry(`期末市值（${latestCompleteFiscalYear} 年度第 4 季期末日）`, latestCompleteFiscalYear, currentMarketCap),
      ...flowEntries,
    ],
    methodologyNote:
      `一美元原則 = (期末市值 − 期初市值) ÷ (累計保留盈餘 × 1000)；累計保留盈餘 = ${baseFiscalYear + 1}～${latestCompleteFiscalYear} 年度淨利加總 − |股利發放加總|（財報單位千元，市值單位元，所以 ×1000）。` +
      (cumulativeRetainedEarnings === null
        ? '本次 5 年窗口不齊（有年度缺淨利或現金流量表），不計算。'
        : `本次中繼值：淨利加總 ${cumulativeNetIncome.toString()}、|股利發放加總| ${dividendsAbs.toString()}、累計保留盈餘 ${cumulativeRetainedEarnings.toString()}（千元）。`) +
      '任一期淨利或現金流量表缺列視為窗口不齊；累計保留盈餘 ≤ 0 時比值沒有意義，不計算。',
  };
};
