import { rocYearToGregorian } from '@/domain/calendar/rocQuarter';
import { trailingPeriodLabel } from '../../shared/trailingYear';
import type { QuarterlyMetricQuery } from '@/domain/financials/quarterlyMetric';
import { toProvenanceEntryValue, type MetricProvenanceResult, type ProvenanceEntry } from '../../shared/provenance/provenanceTypes';
import { commonShareEntries } from '../../shared/provenance/shareEntries';
import { resolvePretaxIncomePerShareInputs, type PretaxIncomePerShareDeps } from './computePretaxIncomePerShare';

// 2026-09-15 應 web-nuxt「營收到股利去了哪裡」瀑布圖卡片需求新增——跟 getEpsProvenance.ts 幾乎同一種形狀，差別只在分子用
// 損益表的 profit_loss_before_tax（稅前淨利）取代淨利 picker。固定回傳 TTM（跟其餘試點慣例一致）。
//
// 2026-10-01 改成跟 computePretaxIncomePerShare 共用 resolvePretaxIncomePerShareInputs：原本這裡只讀一般損益表，沒有寫入路徑的
// 銀行監理專用表 fallback（一般表缺稅前淨利的銀行／金控季度，寫入有值、溯源卻是 null）。值直接取 resolution.pretaxIncomePerShareTtm；
// 哪一期是從銀行專用表補的，寫在那一列的 sourceDescription（fieldKey 照樣是 profit_loss_before_tax，兩張表是同一份文件的同一個數字）。

export const getPretaxIncomePerShareProvenance = async (query: QuarterlyMetricQuery, deps: PretaxIncomePerShareDeps): Promise<MetricProvenanceResult> => {
  const r = await resolvePretaxIncomePerShareInputs(query, deps);

  if (!r) {
    return { symbol: query.symbol, metricCode: 'pretaxIncomePerShare', found: false, fiscalYear: null, fiscalQuarter: null, value: null, entries: [], methodologyNote: null };
  }

  const entries: ProvenanceEntry[] = [
    ...r.ttmQuarters.map((tq, i): ProvenanceEntry => {
      const resolved = r.ttmRecords[i];
      return {
        role: `近一年 稅前淨利（${trailingPeriodLabel(tq, r.trailing.basis)}）`,
        fiscalYear: rocYearToGregorian(Number(tq.year)),
        fiscalQuarter: Number(tq.season),
        type: 'statementField',
        statementType: 'incomeStatement',
        fieldKey: 'profit_loss_before_tax',
        sourceDescription: resolved?.fromBankStatement ? '一般損益表缺這一期，改用銀行監理專用損益表的稅前淨利（同一份財報的同一個數字）' : null,
        value: toProvenanceEntryValue(resolved?.profitBeforeTax ?? null),
      };
    }),
    ...commonShareEntries(r.shares, r.fiscalYear, r.seasonNum),
  ];

  return {
    symbol: r.symbol,
    metricCode: 'pretaxIncomePerShare',
    found: true,
    fiscalYear: r.fiscalYear,
    fiscalQuarter: r.seasonNum,
    value: r.pretaxIncomePerShareTtm,
    entries,
    methodologyNote: null,
  };
};
