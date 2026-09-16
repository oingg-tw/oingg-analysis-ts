import { getBankIncomeStatementQuarter, getLatestQuarterWithBankIncomeStatement } from '@/infrastructure/repositories/mops/bankIncomeStatementXbrl';
import { getPaidInSharesAsOf } from '@/infrastructure/repositories/mops/capitalStock';
import { isFinancialIndustryCompany } from '@/infrastructure/repositories/exchange/securitiesIndustry';
import { getPastNQuarters, rocYearToGregorian, type Season } from '@/domain/calendar/rocQuarter';
import type { QuarterlyMetricQuery } from '@/domain/financials/quarterlyMetric';
import { resolveKnowledgeDate } from '../../knowledgeDate';

import { writeMetricValue, periodTypeGroup } from '../../metricValueWriter';
import type { BasisOutcome, QuarterlyPitOutcomeBase } from '../../pitOutcome';
import { calculateBankNetInterestIncomePerShare } from '@/domain/metrics/profitability/bankNetInterestIncomePerShare/calculateBankNetInterestIncomePerShare';
import { calculateBankNetNonInterestIncomePerShare } from '@/domain/metrics/profitability/bankNetNonInterestIncomePerShare/calculateBankNetNonInterestIncomePerShare';
import { calculateBankBadDebtProvisionPerShare } from '@/domain/metrics/profitability/bankBadDebtProvisionPerShare/calculateBankBadDebtProvisionPerShare';
import { calculateBankOtherOperatingExpensePerShare } from '@/domain/metrics/profitability/bankOtherOperatingExpensePerShare/calculateBankOtherOperatingExpensePerShare';

// 應「銀行業營收到股利去了哪裡」瀑布圖卡片需求新增——一次查詢
// export.bank_income_statement_detail_xbrl，拆成 4 個獨立 metric_code（跟
// computeCashFlowPerSharePit.ts/computeDupontFamilyPit.ts 同一種「一次查詢、拆多個
// metric_code」模式）：bankNetInterestIncomePerShare/bankNetNonInterestIncomePerShare/
// bankBadDebtProvisionPerShare/bankOtherOperatingExpensePerShare。
//
// 「其他營業費用」用殘差法算出（見 bankOtherOperatingExpensePerShareDefinition.ts 的
// formulaNote），保證瀑布圖「利息淨收益+非利息淨收益－呆帳費用－其他營業費用＝稅前淨利」
// 這條式子每一步都加總得起來，不逐項列舉銀行損益表底下數十個細碎費用科目。
//
// 只對銀行/金控（industry='17'）計算——跟 computeBankCapitalAdequacyFamilyPit.ts 同一種
// 「碰資料庫之前先用產業分類擋掉」的防禦設計，避免非銀行公司對這批只有銀行才有意義的
// metricCode 做注定產出 null 的無意義查詢，也避免在 evaluateCompanyBadges.ts 的
// 「從未寫入過任何一列」過濾邏輯裡製造混淆。

export interface BankIncomeWaterfallPitOutcome extends QuarterlyPitOutcomeBase {
  bankNetInterestIncomePerShareQ: BasisOutcome;
  bankNetInterestIncomePerShareTtm: BasisOutcome;
  bankNetNonInterestIncomePerShareQ: BasisOutcome;
  bankNetNonInterestIncomePerShareTtm: BasisOutcome;
  bankBadDebtProvisionPerShareQ: BasisOutcome;
  bankBadDebtProvisionPerShareTtm: BasisOutcome;
  bankOtherOperatingExpensePerShareQ: BasisOutcome;
  bankOtherOperatingExpensePerShareTtm: BasisOutcome;
}

const skippedAll = (action: 'skipped_no_quarter' | 'skipped_no_knowledge_date'): Omit<BankIncomeWaterfallPitOutcome, 'symbol' | 'rocYear' | 'season'> => ({
  bankNetInterestIncomePerShareQ: { action },
  bankNetInterestIncomePerShareTtm: { action },
  bankNetNonInterestIncomePerShareQ: { action },
  bankNetNonInterestIncomePerShareTtm: { action },
  bankBadDebtProvisionPerShareQ: { action },
  bankBadDebtProvisionPerShareTtm: { action },
  bankOtherOperatingExpensePerShareQ: { action },
  bankOtherOperatingExpensePerShareTtm: { action },
});

export const computeAndWriteBankIncomeWaterfallPit = async (query: QuarterlyMetricQuery): Promise<BankIncomeWaterfallPitOutcome> => {
  const { symbol, dataType, subsidiaryCompanyId } = query;

  if (!(await isFinancialIndustryCompany(symbol))) {
    return { symbol, rocYear: null, season: null, ...skippedAll('skipped_no_quarter') };
  }

  const resolvedQuarter =
    query.year !== undefined && query.season !== undefined
      ? { year: Number(query.year), quarter: Number(query.season) }
      : await getLatestQuarterWithBankIncomeStatement(symbol, dataType, subsidiaryCompanyId);

  if (!resolvedQuarter) {
    return { symbol, rocYear: null, season: null, ...skippedAll('skipped_no_quarter') };
  }

  const { year: rocYear, quarter: seasonNum } = resolvedQuarter;
  const fiscalYear = rocYearToGregorian(rocYear);

  const key = { symbol, year: rocYear, quarter: seasonNum, dataType, subsidiaryCompanyId };
  const statement = await getBankIncomeStatementQuarter(key);
  const netInterestIncome = statement?.netInterestIncome ?? null;
  const netNonInterestIncome = statement?.netNonInterestIncome ?? null;
  const badDebtProvision = statement?.badDebtProvision ?? null;
  const profitBeforeTax = statement?.profitBeforeTax ?? null;
  const otherOperatingExpense =
    netInterestIncome !== null && netNonInterestIncome !== null && badDebtProvision !== null && profitBeforeTax !== null
      ? netInterestIncome + netNonInterestIncome - badDebtProvision - profitBeforeTax
      : null;
  const reportDate = statement?.reportDate ?? null;

  const shares = reportDate ? await getPaidInSharesAsOf(symbol, reportDate) : null;
  const sharesValue = shares?.paidInShares ?? null;

  const netInterestQ = calculateBankNetInterestIncomePerShare(netInterestIncome, sharesValue);
  const netNonInterestQ = calculateBankNetNonInterestIncomePerShare(netNonInterestIncome, sharesValue);
  const badDebtQ = calculateBankBadDebtProvisionPerShare(badDebtProvision, sharesValue);
  const otherOpexQ = calculateBankOtherOperatingExpensePerShare(otherOperatingExpense, sharesValue);

  const mainAnchor = await resolveKnowledgeDate(symbol, [{ rocYear, season: seasonNum, reportDate }]);
  const coordinateFor = (metricCode: string) => ({ symbol, metricCode, fiscalYear, fiscalQuarter: seasonNum, dataType, subsidiaryCompanyId });

  let bankNetInterestIncomePerShareQ: BasisOutcome;
  let bankNetNonInterestIncomePerShareQ: BasisOutcome;
  let bankBadDebtProvisionPerShareQ: BasisOutcome;
  let bankOtherOperatingExpensePerShareQ: BasisOutcome;

  if (!mainAnchor) {
    bankNetInterestIncomePerShareQ = { action: 'skipped_no_knowledge_date' };
    bankNetNonInterestIncomePerShareQ = { action: 'skipped_no_knowledge_date' };
    bankBadDebtProvisionPerShareQ = { action: 'skipped_no_knowledge_date' };
    bankOtherOperatingExpensePerShareQ = { action: 'skipped_no_knowledge_date' };
  } else {
    const { knowledgeDate, isFallback: knowledgeDateIsFallback } = mainAnchor;
    bankNetInterestIncomePerShareQ = await writeMetricValue({ ...coordinateFor('bankNetInterestIncomePerShare'), ...periodTypeGroup('Q'), value: netInterestQ.value, nullReason: netInterestQ.nullReason, knowledgeDate, knowledgeDateIsFallback });
    bankNetNonInterestIncomePerShareQ = await writeMetricValue({ ...coordinateFor('bankNetNonInterestIncomePerShare'), ...periodTypeGroup('Q'), value: netNonInterestQ.value, nullReason: netNonInterestQ.nullReason, knowledgeDate, knowledgeDateIsFallback });
    bankBadDebtProvisionPerShareQ = await writeMetricValue({ ...coordinateFor('bankBadDebtProvisionPerShare'), ...periodTypeGroup('Q'), value: badDebtQ.value, nullReason: badDebtQ.nullReason, knowledgeDate, knowledgeDateIsFallback });
    bankOtherOperatingExpensePerShareQ = await writeMetricValue({ ...coordinateFor('bankOtherOperatingExpensePerShare'), ...periodTypeGroup('Q'), value: otherOpexQ.value, nullReason: otherOpexQ.nullReason, knowledgeDate, knowledgeDateIsFallback });
  }

  // TTM：近四季（含本季）加總。一季只要任一原始欄位為 null 就視為該季不齊——四個
  // metric_code 共用同一組「資料齊不齊」判斷（跟 cashFlowPerShare 的 OCF/FCF 一致）。
  const ttmQuarters = getPastNQuarters({ rocYear, season: String(seasonNum) as Season }, 4);
  const ttmRecords = await Promise.all(
    ttmQuarters.map((tq) => getBankIncomeStatementQuarter({ symbol, year: Number(tq.year), quarter: Number(tq.season), dataType, subsidiaryCompanyId }))
  );

  let netInterestTtmSum = 0n;
  let netNonInterestTtmSum = 0n;
  let badDebtTtmSum = 0n;
  let profitBeforeTaxTtmSum = 0n;
  let ttmComplete = true;
  for (const record of ttmRecords) {
    if (record === null || record.netInterestIncome === null || record.netNonInterestIncome === null || record.badDebtProvision === null || record.profitBeforeTax === null) {
      ttmComplete = false;
    } else {
      netInterestTtmSum += record.netInterestIncome;
      netNonInterestTtmSum += record.netNonInterestIncome;
      badDebtTtmSum += record.badDebtProvision;
      profitBeforeTaxTtmSum += record.profitBeforeTax;
    }
  }
  const otherOpexTtmSum = ttmComplete ? netInterestTtmSum + netNonInterestTtmSum - badDebtTtmSum - profitBeforeTaxTtmSum : null;

  const netInterestTtmCalc = ttmComplete ? calculateBankNetInterestIncomePerShare(netInterestTtmSum, sharesValue) : { value: null, nullReason: 'insufficient_history' as const };
  const netNonInterestTtmCalc = ttmComplete ? calculateBankNetNonInterestIncomePerShare(netNonInterestTtmSum, sharesValue) : { value: null, nullReason: 'insufficient_history' as const };
  const badDebtTtmCalc = ttmComplete ? calculateBankBadDebtProvisionPerShare(badDebtTtmSum, sharesValue) : { value: null, nullReason: 'insufficient_history' as const };
  const otherOpexTtmCalc = ttmComplete ? calculateBankOtherOperatingExpensePerShare(otherOpexTtmSum, sharesValue) : { value: null, nullReason: 'insufficient_history' as const };

  let bankNetInterestIncomePerShareTtm: BasisOutcome;
  let bankNetNonInterestIncomePerShareTtm: BasisOutcome;
  let bankBadDebtProvisionPerShareTtm: BasisOutcome;
  let bankOtherOperatingExpensePerShareTtm: BasisOutcome;

  if (ttmComplete) {
    const ttmAnchor = await resolveKnowledgeDate(
      symbol,
      ttmQuarters.map((tq, i) => ({ rocYear: Number(tq.year), season: Number(tq.season), reportDate: ttmRecords[i]?.reportDate ?? null }))
    );
    if (!ttmAnchor) {
      bankNetInterestIncomePerShareTtm = { action: 'skipped_no_knowledge_date' };
      bankNetNonInterestIncomePerShareTtm = { action: 'skipped_no_knowledge_date' };
      bankBadDebtProvisionPerShareTtm = { action: 'skipped_no_knowledge_date' };
      bankOtherOperatingExpensePerShareTtm = { action: 'skipped_no_knowledge_date' };
    } else {
      const { knowledgeDate, isFallback: knowledgeDateIsFallback } = ttmAnchor;
      bankNetInterestIncomePerShareTtm = await writeMetricValue({ ...coordinateFor('bankNetInterestIncomePerShare'), ...periodTypeGroup('TTM'), value: netInterestTtmCalc.value, nullReason: netInterestTtmCalc.nullReason, knowledgeDate, knowledgeDateIsFallback });
      bankNetNonInterestIncomePerShareTtm = await writeMetricValue({ ...coordinateFor('bankNetNonInterestIncomePerShare'), ...periodTypeGroup('TTM'), value: netNonInterestTtmCalc.value, nullReason: netNonInterestTtmCalc.nullReason, knowledgeDate, knowledgeDateIsFallback });
      bankBadDebtProvisionPerShareTtm = await writeMetricValue({ ...coordinateFor('bankBadDebtProvisionPerShare'), ...periodTypeGroup('TTM'), value: badDebtTtmCalc.value, nullReason: badDebtTtmCalc.nullReason, knowledgeDate, knowledgeDateIsFallback });
      bankOtherOperatingExpensePerShareTtm = await writeMetricValue({ ...coordinateFor('bankOtherOperatingExpensePerShare'), ...periodTypeGroup('TTM'), value: otherOpexTtmCalc.value, nullReason: otherOpexTtmCalc.nullReason, knowledgeDate, knowledgeDateIsFallback });
    }
  } else if (mainAnchor) {
    const { knowledgeDate, isFallback: knowledgeDateIsFallback } = mainAnchor;
    bankNetInterestIncomePerShareTtm = await writeMetricValue({ ...coordinateFor('bankNetInterestIncomePerShare'), ...periodTypeGroup('TTM'), value: null, nullReason: 'insufficient_history', knowledgeDate, knowledgeDateIsFallback });
    bankNetNonInterestIncomePerShareTtm = await writeMetricValue({ ...coordinateFor('bankNetNonInterestIncomePerShare'), ...periodTypeGroup('TTM'), value: null, nullReason: 'insufficient_history', knowledgeDate, knowledgeDateIsFallback });
    bankBadDebtProvisionPerShareTtm = await writeMetricValue({ ...coordinateFor('bankBadDebtProvisionPerShare'), ...periodTypeGroup('TTM'), value: null, nullReason: 'insufficient_history', knowledgeDate, knowledgeDateIsFallback });
    bankOtherOperatingExpensePerShareTtm = await writeMetricValue({ ...coordinateFor('bankOtherOperatingExpensePerShare'), ...periodTypeGroup('TTM'), value: null, nullReason: 'insufficient_history', knowledgeDate, knowledgeDateIsFallback });
  } else {
    bankNetInterestIncomePerShareTtm = { action: 'skipped_no_knowledge_date' };
    bankNetNonInterestIncomePerShareTtm = { action: 'skipped_no_knowledge_date' };
    bankBadDebtProvisionPerShareTtm = { action: 'skipped_no_knowledge_date' };
    bankOtherOperatingExpensePerShareTtm = { action: 'skipped_no_knowledge_date' };
  }

  return {
    symbol,
    rocYear: String(rocYear),
    season: String(seasonNum),
    bankNetInterestIncomePerShareQ,
    bankNetInterestIncomePerShareTtm,
    bankNetNonInterestIncomePerShareQ,
    bankNetNonInterestIncomePerShareTtm,
    bankBadDebtProvisionPerShareQ,
    bankBadDebtProvisionPerShareTtm,
    bankOtherOperatingExpensePerShareQ,
    bankOtherOperatingExpensePerShareTtm,
  };
};
