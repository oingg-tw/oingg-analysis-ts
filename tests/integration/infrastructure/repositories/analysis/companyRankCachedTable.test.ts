import { test } from 'vitest';
import assert from 'node:assert/strict';
import { analysisMetricValueQueries, runAnalysisRawQuery } from '@/infrastructure/repositories/analysis/metricValueQueries';
import { buildCompanyRankSql } from '@/infrastructure/repositories/analysis/screenerQueries';
import { resolveTimeframeForMetric } from '@/application/metrics/resolveTimeframeForMetric';
import type { CompanyRankRow } from '@/application/ports/metricValueQueries';

// 2026-09-29 companyRank 改成「快取整張排名表、再取該公司那一列」：釘住它跟原本「直接查單一公司」逐欄一致
// （rank 並列、total_count、quintile、threshold_value、查無此公司回空陣列），含類股母體（candidateSymbols）。
const field = resolveTimeframeForMetric('rdIntensity', 'TTM', 'rdIntensity.TTM');
const direct = (symbol: string, candidates: string[] | null) =>
  runAnalysisRawQuery<CompanyRankRow>(buildCompanyRankSql(symbol, field, 'desc', true, candidates, 20));

test('cached rank table matches per-symbol query', async () => {
  const candidates = ['2330', '2303', '2454', '3711', '2379'];
  for (const [symbol, scope] of [['2330', null], ['2454', null], ['ZZNOTREAL', null], ['2303', candidates], ['2330', candidates]] as const) {
    const cached = await analysisMetricValueQueries.companyRank(symbol, field, 'desc', true, scope, 20);
    assert.deepEqual(cached, await direct(symbol, scope), `${symbol} ${scope ? 'sector' : 'market'}`);
  }
}, 60_000);
