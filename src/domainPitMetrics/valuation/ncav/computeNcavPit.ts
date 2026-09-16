import { resolveQuarterOrLatest } from '@/models/latestQuarter';
import { financialDataAdapter, type BalanceSheetPort } from '@/domainPitMetrics/shared/ports/financialDataPorts';
import type { QuarterlyMetricQuery } from '@/domain/financials/quarterlyMetric';
import { resolveKnowledgeDate } from '../../knowledgeDate';

import { writeMetricValue, periodTypeGroup } from '../../metricValueWriter';
import type { BasisOutcome, StandardBasisPitOutcome } from '../../pitOutcome';
import type { MetricNullReason } from '../../metricBasis';
import { rocYearToGregorian } from '@/domain/calendar/rocQuarter';

// 這份檔案是 src/domainMetrics/ncav.ts 的獨立重新實作。純資產負債表時點快照，只有 Q 一種
// basis。2026-09-10 改回公司總額（不除以股數），理由見 ncavDefinition.ts 的說明——跟
// 新增的 marketCap 指標比較用「總額 vs 總額」，不需要股數這個中介變數，也因此不用再查
// capitalStock。

// 資產負債表欄位是千元（thousands），乘 1000 還原成新台幣元的公司總額。
const toTotalValue = (valueInThousands: bigint): number => Math.round(Number(valueInThousands) * 1000 * 100) / 100;

export type NcavPitOutcome = StandardBasisPitOutcome;

export const computeAndWriteNcavPit = async (query: QuarterlyMetricQuery, statements: BalanceSheetPort = financialDataAdapter): Promise<NcavPitOutcome> => {
  const { symbol, dataType, subsidiaryCompanyId } = query;

  const resolvedQuarter = await resolveQuarterOrLatest(query, ['balanceSheet']);

  if (!resolvedQuarter) {
    return { symbol, rocYear: null, season: null, q: { action: 'skipped_no_quarter' } };
  }

  const { year, season } = resolvedQuarter;
  const rocYear = Number(year);
  const seasonNum = Number(season);
  const fiscalYear = rocYearToGregorian(rocYear);

  const key = { symbol, year: rocYear, quarter: seasonNum, dataType, subsidiaryCompanyId };
  const balanceSheet = await statements.getBalanceSheet(key);
  const currentAssets = balanceSheet?.currentAssets ?? null;
  const totalLiabilities = balanceSheet?.totalLiabilities ?? null;
  const preferredStockCapital = balanceSheet?.preferredStockCapital ?? 0n;
  const reportDate = balanceSheet?.reportDate ?? null;

  const netCurrentAssetValueInThousands = currentAssets !== null && totalLiabilities !== null ? currentAssets - totalLiabilities - preferredStockCapital : null;
  const ncav = netCurrentAssetValueInThousands !== null ? toTotalValue(netCurrentAssetValueInThousands) : null;
  const nullReason: MetricNullReason | null = ncav === null ? 'missing_input' : null;

  const mainAnchor = await resolveKnowledgeDate(symbol, [{ rocYear, season: seasonNum, reportDate }]);

  let q: BasisOutcome;
  if (!mainAnchor) {
    q = { action: 'skipped_no_knowledge_date' };
  } else {
    q = await writeMetricValue({
      symbol,
      metricCode: 'ncav',
      fiscalYear,
      fiscalQuarter: seasonNum,
      dataType,
      subsidiaryCompanyId,
      ...periodTypeGroup('Q'),
      value: ncav,
      nullReason,
      knowledgeDate: mainAnchor.knowledgeDate,
      knowledgeDateIsFallback: mainAnchor.isFallback,
    });
  }

  return { symbol, rocYear: year, season, q };
};
