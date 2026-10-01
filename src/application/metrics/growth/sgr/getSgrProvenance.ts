import { rocYearToGregorian } from '@/domain/calendar/rocQuarter';
import { pickEquityWithFieldKey } from '@/domain/metrics/shared/pickers';
import { trailingPeriodLabel } from '../../shared/trailingYear';
import type { QuarterlyMetricQuery } from '@/domain/financials/quarterlyMetric';
import { toProvenanceEntryValue, type MetricProvenanceResult, type ProvenanceEntry } from '../../shared/provenance/provenanceTypes';
import { averageBalanceEntries, averagedDenominatorEntry } from '../../shared/provenance/averageBalanceEntries';
import { resolveSgrData, type SgrDeps } from './computeSgr';

// 2026-09-13 使用者要求擴大稽核鏈——sgr(TTM) = ROE(TTM) × (1 - 配息率(TTM)/100)。不依賴
// roe/dividendPayoutRatio 這兩個 metric_code 已寫入的值，獨立重新查資產負債表/損益表/現金流量表重算。固定回傳 TTM。
// 2026-10-01 改用 computeSgr 的 resolveSgrData()（同一份資料與計算）：內部 ROE 的分母 2026-09-22 起是 5 個季末權益平均
// （興櫃半年頻 3 點），v3 又加了「整份現金流量表缺席 → 不齊」，這裡原本各自重算、兩處都沒跟上，溯源值跟儲存值對不上。

export const getSgrProvenance = async (query: QuarterlyMetricQuery, deps: SgrDeps): Promise<MetricProvenanceResult> => {
  const resolution = await resolveSgrData(query, deps);
  if (!resolution) {
    return { symbol: query.symbol, metricCode: 'sgr', found: false, fiscalYear: null, fiscalQuarter: null, value: null, entries: [], methodologyNote: null };
  }

  const { symbol, fiscalYear, seasonNum, balances, basis, ttmQuarters, ttmRecords, ttmNetIncomes: netIncomes, roeTtm, payoutRatioTtm, sgrTtm } = resolution;
  const dividendsPaid = ttmRecords.map(([, cashFlowRecord]) => cashFlowRecord?.dividendsPaid ?? null);

  const entries: ProvenanceEntry[] = [
    ...averageBalanceEntries(balances, [{ label: '權益（ROE 分母）', fieldKey: (bs) => pickEquityWithFieldKey(bs).fieldKey, pick: (bs) => pickEquityWithFieldKey(bs).value }]),
    averagedDenominatorEntry('平均權益（ROE 分母）', balances, balances.equityAvgTtm),
    ...ttmQuarters.flatMap((tq, i): ProvenanceEntry[] => {
      const entryFiscalYear = rocYearToGregorian(Number(tq.year));
      const entryFiscalQuarter = Number(tq.season);
      return [
        {
          role: `近一年 淨利（${trailingPeriodLabel(tq, basis)}，用於 ROE 與配息率）`,
          fiscalYear: entryFiscalYear,
          fiscalQuarter: entryFiscalQuarter,
          type: 'statementField' as const,
          statementType: 'incomeStatement' as const,
          fieldKey: netIncomes[i]!.fieldKey,
          sourceDescription: null,
          value: toProvenanceEntryValue(netIncomes[i]!.value),
        },
        {
          role: `近一年 發放股利（${trailingPeriodLabel(tq, basis)}，用於配息率，原始資料是現金流出負值）`,
          fiscalYear: entryFiscalYear,
          fiscalQuarter: entryFiscalQuarter,
          type: 'statementField' as const,
          statementType: 'cashFlowStatement' as const,
          fieldKey: ttmRecords[i]?.[1]?.dividendsPaidFieldKey ?? null,
          sourceDescription: null,
          value: toProvenanceEntryValue(dividendsPaid[i]),
        },
      ];
    }),
  ];

  return {
    symbol,
    metricCode: 'sgr',
    found: true,
    fiscalYear,
    fiscalQuarter: seasonNum,
    value: sgrTtm,
    entries,
    methodologyNote: `ROE(TTM)＝${roeTtm ?? 'null'}，配息率(TTM)＝${payoutRatioTtm ?? 'null'}，兩者皆是計算出的中繼值，不是財報原始欄位（見上方原始欄位）。sgr = ROE(TTM) × (1 - 配息率(TTM)/100)；ROE 分母是近四季窗口 5 個季末權益的平均（興櫃半年頻 3 點）。近一年任一期整份現金流量表缺席時算不出來（不當成沒發股利）。`,
  };
};
