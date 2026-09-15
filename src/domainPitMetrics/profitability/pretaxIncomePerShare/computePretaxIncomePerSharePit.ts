import { resolveQuarterOrLatest } from '@/models/latestQuarter';
import { determineNullReason, toPerShare } from '@/domainPitMetrics/shared/numericHelpers';
import { financialDataAdapter, type IncomeStatementPort, type PaidInSharesPort } from '@/domainPitMetrics/shared/ports/financialDataPorts';
import { getPastNQuarters, rocYearToGregorian, type Season } from '@/shared/rocQuarter';
import type { QuarterlyMetricQuery } from '@/shared/quarterlyMetric';
import { resolveKnowledgeDate } from '../../knowledgeDate';

import { writeOrSkip, writeMetricValue, periodTypeGroup } from '../../metricValueWriter';
import type { BasisOutcome, StandardBasisPitOutcome } from '../../pitOutcome';
import type { MetricNullReason } from '../../metricBasis';

// 2026-09-15 應 web-nuxt「營收到股利去了哪裡」瀑布圖卡片需求新增——跟 computeEpsPit.ts
// 幾乎同一種形狀，差別只在分子用 profitBeforeTax（稅前淨利，不分歸屬母公司/整體口徑，
// 損益表本來就只有一個稅前淨利欄位）取代 pickNetIncome()。三張季度財報表金額單位是
// 「千元」，流通股數是實際股數，分子要先 x1000 換算成元（跟 eps 一致）。

export type PretaxIncomePerSharePitOutcome = StandardBasisPitOutcome;

export const computeAndWritePretaxIncomePerSharePit = async (
  query: QuarterlyMetricQuery,
  statements: IncomeStatementPort & PaidInSharesPort = financialDataAdapter
): Promise<PretaxIncomePerSharePitOutcome> => {
  const { symbol, dataType, subsidiaryCompanyId } = query;

  const resolvedQuarter = await resolveQuarterOrLatest(query, ['incomeStatement']);

  if (!resolvedQuarter) {
    return {
      symbol,
      rocYear: null,
      season: null,
      q: { action: 'skipped_no_quarter' },
      ttm: { action: 'skipped_no_quarter' },
    };
  }

  const { year, season } = resolvedQuarter;
  const rocYear = Number(year);
  const seasonNum = Number(season);
  const fiscalYear = rocYearToGregorian(rocYear);

  const key = { symbol, year: rocYear, quarter: seasonNum, dataType, subsidiaryCompanyId };
  const incomeStatement = await statements.getIncomeStatement(key);
  const profitBeforeTax = incomeStatement?.profitBeforeTax ?? null;
  const reportDate = incomeStatement?.reportDate ?? null;

  // 流通股數固定用「本季報告日」當下有效的股本，Q/TTM 共用同一個股數（跟 eps 一致）。
  const shares = reportDate ? await statements.getPaidInShares(symbol, reportDate) : null;
  const sharesValue = shares?.paidInShares ?? null;

  const pretaxIncomePerShareQuarterly = profitBeforeTax !== null && sharesValue !== null ? toPerShare(profitBeforeTax, sharesValue) : null;
  const quarterlyNullReason: MetricNullReason | null = pretaxIncomePerShareQuarterly === null ? determineNullReason(profitBeforeTax, sharesValue) : null;

  const mainAnchor = await resolveKnowledgeDate(symbol, [{ rocYear, season: seasonNum, reportDate }]);

  const coordinateBase = { symbol, metricCode: 'pretaxIncomePerShare', fiscalYear, fiscalQuarter: seasonNum, dataType, subsidiaryCompanyId };

  const q = await writeOrSkip(mainAnchor, coordinateBase, 'Q', pretaxIncomePerShareQuarterly, quarterlyNullReason);

  // TTM：近四季（含本季）稅前淨利加總 / 流通股數。四季不齊時仍寫一列 value=null/insufficient_history，
  // knowledge_date 沿用本季（Q）自己的，跟 computeEpsPit.ts 的 TTM 處理一致。
  const ttmQuarters = getPastNQuarters({ rocYear, season: season as Season }, 4);
  const ttmRecords = await Promise.all(
    ttmQuarters.map((tq) => statements.getIncomeStatement({ symbol, year: Number(tq.year), quarter: Number(tq.season), dataType, subsidiaryCompanyId }))
  );

  let ttmSum = 0n;
  let ttmComplete = true;
  for (const record of ttmRecords) {
    if (record === null || record.profitBeforeTax === null) {
      ttmComplete = false;
    } else {
      ttmSum += record.profitBeforeTax;
    }
  }

  const pretaxIncomePerShareTtm = ttmComplete && sharesValue !== null ? toPerShare(ttmSum, sharesValue) : null;
  const ttmNullReason: MetricNullReason | null = pretaxIncomePerShareTtm !== null ? null : ttmComplete ? determineNullReason(ttmSum, sharesValue) : 'insufficient_history';

  let ttm: BasisOutcome;
  if (ttmComplete) {
    const ttmAnchor = await resolveKnowledgeDate(
      symbol,
      ttmQuarters.map((tq, i) => ({ rocYear: Number(tq.year), season: Number(tq.season), reportDate: ttmRecords[i]?.reportDate ?? null }))
    );
    if (!ttmAnchor) {
      ttm = { action: 'skipped_no_knowledge_date' };
    } else {
      ttm = await writeMetricValue({
        ...coordinateBase,
        ...periodTypeGroup('TTM'),
        value: pretaxIncomePerShareTtm,
        nullReason: ttmNullReason,
        knowledgeDate: ttmAnchor.knowledgeDate,
        knowledgeDateIsFallback: ttmAnchor.isFallback,
      });
    }
  } else if (mainAnchor) {
    ttm = await writeMetricValue({
      ...coordinateBase,
      ...periodTypeGroup('TTM'),
      value: null,
      nullReason: 'insufficient_history',
      knowledgeDate: mainAnchor.knowledgeDate,
      knowledgeDateIsFallback: mainAnchor.isFallback,
    });
  } else {
    ttm = { action: 'skipped_no_knowledge_date' };
  }

  return { symbol, rocYear: year, season, q, ttm };
};
