import { getLatestAvailableQuarter } from '@/shared/sourceData/latestQuarter';
import { getBalanceSheetXbrlFirst as getQuarterlyBalanceSheet } from '@/shared/sourceData/balanceSheetXbrlFirst';
import { rocYearToGregorian } from '@/shared/rocQuarter';
import type { QuarterlyMetricQuery } from '@/shared/quarterlyMetric';
import { toProvenanceEntryValue, type MetricProvenanceResult, type ProvenanceEntry } from '../../shared/provenance/provenanceTypes';

// 2026-09-13 使用者要求擴大稽核鏈——ncav = (流動資產 - 總負債 - 特別股股本) × 1000
// (千元換元換算成公司總額)。跟 computeNcavPit.ts 一致，回傳公司總額不除以股數。只有
// Q 一種 basis（資產負債表時點快照）。

const toTotalValue = (valueInThousands: bigint): number => Math.round(Number(valueInThousands) * 1000 * 100) / 100;

export const getNcavProvenance = async (query: QuarterlyMetricQuery): Promise<MetricProvenanceResult> => {
  const { symbol, dataType, subsidiaryCompanyId } = query;

  const resolvedQuarter =
    query.year !== undefined && query.season !== undefined
      ? { year: query.year, season: query.season }
      : await getLatestAvailableQuarter(symbol, dataType, subsidiaryCompanyId, ['balanceSheet']);

  if (!resolvedQuarter) {
    return { symbol, metricCode: 'ncav', found: false, fiscalYear: null, fiscalQuarter: null, value: null, entries: [], methodologyNote: null };
  }

  const { year, season } = resolvedQuarter;
  const rocYear = Number(year);
  const seasonNum = Number(season);
  const fiscalYear = rocYearToGregorian(rocYear);

  const balanceSheet = await getQuarterlyBalanceSheet({ symbol, year: rocYear, quarter: seasonNum, dataType, subsidiaryCompanyId });
  const currentAssets = balanceSheet?.currentAssets ?? null;
  const totalLiabilities = balanceSheet?.totalLiabilities ?? null;
  const preferredStockCapital = balanceSheet?.preferredStockCapital ?? 0n;

  const netCurrentAssetValueInThousands = currentAssets !== null && totalLiabilities !== null ? currentAssets - totalLiabilities - preferredStockCapital : null;
  const value = netCurrentAssetValueInThousands !== null ? toTotalValue(netCurrentAssetValueInThousands) : null;

  const entries: ProvenanceEntry[] = [
    { role: '本季期末流動資產', fiscalYear, fiscalQuarter: seasonNum, type: 'statementField', statementType: 'balanceSheet', fieldKey: 'current_assets', sourceDescription: null, value: toProvenanceEntryValue(currentAssets) },
    { role: '本季期末總負債', fiscalYear, fiscalQuarter: seasonNum, type: 'statementField', statementType: 'balanceSheet', fieldKey: 'liabilities', sourceDescription: null, value: toProvenanceEntryValue(totalLiabilities) },
    { role: '本季期末特別股股本（缺漏視為 0）', fiscalYear, fiscalQuarter: seasonNum, type: 'statementField', statementType: 'balanceSheet', fieldKey: 'preference_share', sourceDescription: null, value: toProvenanceEntryValue(balanceSheet?.preferredStockCapital ?? null) },
  ];

  return { symbol, metricCode: 'ncav', found: true, fiscalYear, fiscalQuarter: seasonNum, value, entries, methodologyNote: null };
};
