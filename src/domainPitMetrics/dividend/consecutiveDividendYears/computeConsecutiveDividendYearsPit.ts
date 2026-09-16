import { resolveQuarterOrLatest } from '@/models/latestQuarter';
import { financialDataAdapter, type CashFlowStatementPort } from '@/domainPitMetrics/shared/ports/financialDataPorts';
import { getPastNQuarters, rocYearToGregorian } from '@/domain/calendar/rocQuarter';
import type { QuarterlyMetricQuery } from '@/domain/financials/quarterlyMetric';
import { resolveKnowledgeDate } from '../../knowledgeDate';

import { writeOrSkip } from '../../metricValueWriter';
import type { StandardBasisPitOutcome } from '../../pitOutcome';
import type { MetricNullReason } from '../../metricBasis';

// 使用者要求「先做邏輯，資料不全面沒關係」——資料源是現金流量表的 dividendsPaid（跟
// dividendPayoutRatio 同一個欄位，XBRL 優先、舊表 fallback），沒有專門的股利分派公告資料源，
// 用「這個會計年度有沒有實際付出股利現金」當作「這年有沒有配息」的判斷依據，不是用董事會
// 決議/股東會通過的股利政策（那需要另一個資料源，目前沒有）。

const MAX_LOOKBACK_YEARS = 30;

export type ConsecutiveDividendYearsPitOutcome = StandardBasisPitOutcome;

export const computeAndWriteConsecutiveDividendYearsPit = async (query: QuarterlyMetricQuery, statements: CashFlowStatementPort = financialDataAdapter): Promise<ConsecutiveDividendYearsPitOutcome> => {
  const { symbol, dataType, subsidiaryCompanyId } = query;

  const resolvedQuarter = await resolveQuarterOrLatest(query, ['cashFlowStatement']);

  if (!resolvedQuarter) {
    return { symbol, rocYear: null, season: null, fy: { action: 'skipped_no_quarter' } };
  }

  const { year, season } = resolvedQuarter;
  const rocYear = Number(year);
  const seasonNum = Number(season);
  const fiscalYear = rocYearToGregorian(rocYear);

  const mainCashFlow = await statements.getCashFlowStatement({ symbol, year: rocYear, quarter: seasonNum, dataType, subsidiaryCompanyId });
  const mainAnchor = await resolveKnowledgeDate(symbol, [{ rocYear, season: seasonNum, reportDate: mainCashFlow?.reportDate ?? null }]);

  // 若最新一季不是 Q4，代表今年度還沒結束，起算年退回上一個完整年度——不把「今年至今」這種
  // 尚未結束的年度算進連續配息年數，避免今年還沒發放就被誤判成「中斷」。
  const latestCompleteFiscalYear = seasonNum === 4 ? rocYear : rocYear - 1;

  let consecutiveYears = 0;
  let cursorRocYear = latestCompleteFiscalYear;
  let firstYearDataAvailable = false;

  for (let i = 0; i < MAX_LOOKBACK_YEARS; i++) {
    const yearQuarters = getPastNQuarters({ rocYear: cursorRocYear, season: '4' }, 4);
    const records = await Promise.all(
      yearQuarters.map((q) => statements.getCashFlowStatement({ symbol, year: Number(q.year), quarter: Number(q.season), dataType, subsidiaryCompanyId }))
    );

    // 四季只要有一季查無資料，代表這個年度資料不完整，沒辦法判斷這年到底有沒有配息——保守
    // 停在這裡（寧可低估連續年數，不要因為資料缺口就誤判成「中斷」）。
    if (records.some((r) => r === null)) break;
    firstYearDataAvailable = true;

    const yearDividendsPaid = records.reduce((sum, r) => sum + (r?.dividendsPaid ?? 0n), 0n);
    if (yearDividendsPaid === 0n) break;

    consecutiveYears += 1;
    cursorRocYear -= 1;
  }

  // 連最近一個完整年度的資料都拿不到，代表連「有沒有配息」都無法判斷，回傳 null（不是 0）——
  // 0 是「有資料、確定沒配息」的意思，兩者語意不同不能混用。
  const value = firstYearDataAvailable ? consecutiveYears : null;
  const nullReason: MetricNullReason | null = value === null ? 'insufficient_history' : null;

  const coordinateBase = { symbol, metricCode: 'consecutiveDividendYears', fiscalYear, fiscalQuarter: seasonNum, dataType, subsidiaryCompanyId };

  const fy = await writeOrSkip(mainAnchor, coordinateBase, 'FY', value, nullReason);

  return { symbol, rocYear: year, season, fy };
};
