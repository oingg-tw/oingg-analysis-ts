import { resolveQuarterOrLatest } from '@/application/financials/latestQuarter';
import { toPercent } from '@/domainPitMetrics/shared/numericHelpers';
import { financialDataAdapter, type BalanceSheetPort } from '@/domainPitMetrics/shared/ports/financialDataPorts';
import type { QuarterlyMetricQuery } from '@/domain/financials/quarterlyMetric';
import { resolveKnowledgeDate } from '../../knowledgeDate';

import { writeMetricValue, periodTypeGroup } from '../../metricValueWriter';
import type { BasisOutcome, StandardBasisPitOutcome } from '../../pitOutcome';
import type { MetricNullReason } from '../../metricBasis';
import { rocYearToGregorian } from '@/domain/calendar/rocQuarter';

// 2026-09-15 使用者要求新增——Benjamin Graham《The Intelligent Investor》防禦型投資者
// 「財務體質健全」測試的後半條件（前半是流動比率 ≥200%，已經是 currentRatio 這支指標，
// 見 currentRatioBadge.ts 的說明）：長期負債不超過淨流動資產。
//
// 長期負債 = 長期借款 + 應付公司債（非流動部分），跟 deRatio.ts 定義「有息負債」時用的
// 同一組科目，只是刻意不含短期借款——Graham 原始規則講的是「long-term debt」，跟已經算進
// 流動負債、被淨流動資產計算涵蓋掉的短期借款是兩回事，不要混在一起算兩次。
// 淨流動資產（營運資金）= 流動資產 - 流動負債，跟 netWorkingCapitalToAssets.ts 內部算的
// 分子同一個公式，但這裡獨立重新計算（不讀取那支指標已寫入的值），維持本服務一貫的
// 「每個 metricCode 各自從原始財報欄位重新推導」慣例。
//
// 淨流動資產 <=0（流動負債超過流動資產）時不計算百分比——分母變號會讓比率的「越小越安全」
// 語意整個反過來，硬算出來的負數百分比拿去跟 100% 比較反而會誤判成通過門檻，這種情況本身
// 已經是流動比率 <100%，currentRatio 那支指標的 ≥200% 門檻早就會把它標示出來，不需要這支
// 指標另外處理，直接回傳 null（zero_or_negative_denominator）比硬算一個會誤導判斷的數字更
// 誠實。純資產負債表時點快照，只有 Q 一種 basis。

export type LongTermDebtToNetCurrentAssetsPitOutcome = StandardBasisPitOutcome;

export const computeAndWriteLongTermDebtToNetCurrentAssetsPit = async (
  query: QuarterlyMetricQuery,
  statements: BalanceSheetPort = financialDataAdapter
): Promise<LongTermDebtToNetCurrentAssetsPitOutcome> => {
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
  const reportDate = balanceSheet?.reportDate ?? null;

  const longTermDebt = balanceSheet ? (balanceSheet.longTermBorrowings ?? 0n) + (balanceSheet.bondsPayable ?? 0n) : null;
  const currentAssets = balanceSheet?.currentAssets ?? null;
  const currentLiabilities = balanceSheet?.currentLiabilities ?? null;
  const netCurrentAssets = currentAssets !== null && currentLiabilities !== null ? currentAssets - currentLiabilities : null;

  const value = netCurrentAssets !== null && netCurrentAssets > 0n && longTermDebt !== null ? toPercent(longTermDebt, netCurrentAssets) : null;
  // determineNullReason() 對「denominator===null」統一回傳 missing_input，沒辦法區分
  // 「真的缺資料」跟「有資料但 <=0」這兩種不同成因，這裡的 <=0 情境需要精確標成
  // zero_or_negative_denominator（呼應 currentRatio <100% 早就會標示出來的同一種公司），
  // 不能沿用共用 helper 的合併判斷，改成自己明確分三種情況判斷。
  let nullReason: MetricNullReason | null = null;
  if (value === null) {
    if (longTermDebt === null || currentAssets === null || currentLiabilities === null) nullReason = 'missing_input';
    else nullReason = 'zero_or_negative_denominator';
  }

  const mainAnchor = await resolveKnowledgeDate(symbol, [{ rocYear, season: seasonNum, reportDate }]);

  let q: BasisOutcome;
  if (!mainAnchor) {
    q = { action: 'skipped_no_knowledge_date' };
  } else {
    q = await writeMetricValue({
      symbol,
      metricCode: 'longTermDebtToNetCurrentAssets',
      fiscalYear,
      fiscalQuarter: seasonNum,
      dataType,
      subsidiaryCompanyId,
      ...periodTypeGroup('Q'),
      value,
      nullReason,
      knowledgeDate: mainAnchor.knowledgeDate,
      knowledgeDateIsFallback: mainAnchor.isFallback,
    });
  }

  return { symbol, rocYear: year, season, q };
};
