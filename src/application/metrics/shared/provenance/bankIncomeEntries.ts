import type { BankIncomeStatementFields } from '@/application/ports/financialStatements';
import { toProvenanceEntryValue, type ProvenanceEntry } from './provenanceTypes';

// 2026-10-08 銀行口徑的營收／毛利／營業利益（domain/financials/bankIncome.ts）在溯源表逐項拆開：讀者把各項加減就能對上
// compute 用的營收、毛利。利息收入總額、稅前淨利來自一般損益表（statementField），其餘是銀行損益表明細的科目——不屬於
// 一般三大表的 statementType，照銀行瀑布圖（getBankIncomeWaterfallProvenance.ts）用 type other＋sourceDescription。
// 給每股營收、PSR、營收成長率、營收 CAGR、毛利率、營業利益率、淨利率 7 支溯源共用。
export interface BankIncomeDetail {
  interestIncome: bigint | null;
  bank: BankIncomeStatementFields;
}

type Period = { label: string; fiscalYear: number | null; fiscalQuarter: number | null };

const BANK_SOURCE = '銀行業損益表明細（XBRL 申報）';

export const BANK_INCOME_METHODOLOGY_NOTE =
  '銀行的損益表沒有營業收入與營業成本，這段期間依券商看盤軟體的銀行口徑換算：營收＝利息收入總額＋非利息淨收益；' +
  '毛利＝利息淨收益＋非利息淨收益－呆帳費用及保證責任準備（等於營收扣掉利息費用與呆帳）；營業利益＝稅前淨利。';

const fromBank = (role: string, period: Period, value: bigint | null): ProvenanceEntry => ({
  role,
  fiscalYear: period.fiscalYear,
  fiscalQuarter: period.fiscalQuarter,
  type: 'other',
  statementType: null,
  fieldKey: null,
  sourceDescription: BANK_SOURCE,
  value: toProvenanceEntryValue(value),
});

const fromIncomeStatement = (role: string, period: Period, fieldKey: string, value: bigint | null): ProvenanceEntry => ({
  role,
  fiscalYear: period.fiscalYear,
  fiscalQuarter: period.fiscalQuarter,
  type: 'statementField',
  statementType: 'incomeStatement',
  fieldKey,
  sourceDescription: null,
  value: toProvenanceEntryValue(value),
});

// prefix 例如「近一年」「本季」「去年同季」，跟各支溯源原本的營收 entry 同一種 role 寫法。
export const bankRevenueEntries = (prefix: string, period: Period, detail: BankIncomeDetail): ProvenanceEntry[] => [
  fromIncomeStatement(`${prefix} 營收：利息收入總額（${period.label}，銀行）`, period, 'revenue_from_interest', detail.interestIncome),
  fromBank(`${prefix} 營收：＋非利息淨收益（${period.label}，銀行）`, period, detail.bank.netNonInterestIncome),
];

export const bankGrossProfitEntries = (prefix: string, period: Period, detail: BankIncomeDetail): ProvenanceEntry[] => [
  fromBank(`${prefix} 毛利：利息淨收益（${period.label}，銀行）`, period, detail.bank.netInterestIncome),
  fromBank(`${prefix} 毛利：＋非利息淨收益（${period.label}，銀行）`, period, detail.bank.netNonInterestIncome),
  fromBank(`${prefix} 毛利：－呆帳費用及保證責任準備（${period.label}，銀行）`, period, detail.bank.badDebtProvision),
];

export const bankOperatingIncomeEntry = (prefix: string, period: Period, profitBeforeTax: bigint | null): ProvenanceEntry =>
  fromIncomeStatement(`${prefix} 營業利益：稅前淨利（${period.label}，銀行）`, period, 'profit_loss_before_tax', profitBeforeTax);
