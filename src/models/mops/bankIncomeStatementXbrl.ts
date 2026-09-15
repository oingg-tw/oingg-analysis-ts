// mops-ts export schema 底下銀行業損益表 XBRL 表的即時查詢層——跟 bankRegulatoryXbrl.ts
// 同一種寫法（$queryRawUnsafe，Raw/mapped 兩層 interface，共用同一個 BankRegulatoryKey），
// 差別是這裡查的是損益表科目（`bank_income_statement_detail_xbrl`），不是監理揭露比率。
//
// 2026-09-15 應「銀行業營收到股利去了哪裡」瀑布圖卡片需求新增。這張表覆蓋約 10-11 檔
// 銀行/金控（已跟 mops-ts 交叉驗證），欄位極多（銀行損益表科目遠比一般產業細碎），這裡
// 只曝露瀑布圖需要的少數幾個「官方單一總計/子總計欄位」，刻意不逐項相加細目——
// 跟 mops-ts 來回驗證過：手動加總「呆帳費用」底下疑似獨立的 9 個子科目會少算兩個
// adjustment 科目（AdjustmentForBadDebtsExpenseOfCreditCardsAccountsReceivable/
// AdjustmentForBadDebtsExpenseOfOtherReceivables，這兩個科目資料庫裡確實有欄位，只是
// 一開始沒被查到），逐項相加對不起來官方總計數字的風險真實存在過，改用官方已經算好的
// 單一總計欄位（bad_debt_expenses_and_guarantee_liability_provision）最穩健，不用自己
// 再重新組裝一次银行監理科目的加總邏輯。
//
// 已驗證的官方恆等式（2801 114Q2 真實資料交叉核對）：
//   利息淨收益 + 非利息淨收益 = net_income（中間小計，不是最終稅後淨利，命名容易誤會）
//   總收益(income) − 總費用(expenses) = 稅前淨利(profit_loss_before_tax)
// 「其他營業費用」這條瀑布圖項目沒有對應的乾淨單一總計欄位，用殘差法計算
// （淨收益 − 呆帳費用及保證責任準備 − 稅前淨利），保證每一步都加總得起來，不需要
// 逐一列舉銀行損益表底下數十個費用科目。

import { mopsExportPrisma } from '@/adapters/prisma/mopsExportClient';
import type { BankRegulatoryKey } from './bankRegulatoryXbrl';

export interface BankIncomeStatementQuarterRow {
  reportDate: Date;
  netInterestIncome: bigint | null; // 利息淨收益（net_income_loss_of_interest，已經是利息收入減利息費用後的淨額）
  netNonInterestIncome: bigint | null; // 非利息淨收益（net_non_interest_income_loss，含手續費/投資/匯兌等全部非利息項目淨額）
  badDebtProvision: bigint | null; // 呆帳費用及保證責任準備（官方單一總計欄位，不拆子項）
  profitBeforeTax: bigint | null; // 稅前淨利，跟一般三大表（xbrl_three_statements_long）的 profit_loss_before_tax 是同一份文件的同一個數字，可交叉驗證
}

interface RawBankIncomeStatementQuarterRow {
  report_date: Date;
  net_interest_income: bigint | null;
  net_non_interest_income: bigint | null;
  bad_debt_provision: bigint | null;
  profit_before_tax: bigint | null;
}

// 只取單季欄位（不是 _ytd）——TTM 由呼叫端自己加總近四季的單季值（跟 eps/
// cashFlowPerShare 等既有 per-share 指標同一種慣例），不直接用官方 _ytd 欄位當 TTM
// （_ytd 是「本會計年度至今」不是「近四季」，兩者只有第四季重合）。
export const getBankIncomeStatementQuarter = async (key: BankRegulatoryKey): Promise<BankIncomeStatementQuarterRow | null> => {
  const rows = await mopsExportPrisma.$queryRawUnsafe<RawBankIncomeStatementQuarterRow[]>(
    `SELECT report_date,
            net_income_loss_of_interest_quarter AS net_interest_income,
            net_non_interest_income_loss_quarter AS net_non_interest_income,
            bad_debt_expenses_and_guarantee_liability_provis_962f67 AS bad_debt_provision,
            profit_loss_before_tax_quarter AS profit_before_tax
     FROM "export"."bank_income_statement_detail_xbrl"
     WHERE symbol = $1 AND year = $2 AND quarter = $3 AND data_type = $4 AND subsidiary_company_id = $5
     LIMIT 1`,
    key.symbol,
    key.year,
    key.quarter,
    key.dataType,
    key.subsidiaryCompanyId
  );
  const row = rows[0];
  if (!row || row.net_interest_income === null) return null; // net_interest_income 是這張表對「真的有申報銀行損益表」最可靠的判斷欄位（非銀行公司/沒申報的季度整列皆為 null）
  return {
    reportDate: row.report_date,
    netInterestIncome: row.net_interest_income,
    netNonInterestIncome: row.net_non_interest_income,
    badDebtProvision: row.bad_debt_provision,
    profitBeforeTax: row.profit_before_tax,
  };
};

// 「列存在即算有資料」——net_interest_income 非 null 就代表這季確實有申報銀行損益表
// （跟 bankRegulatoryXbrl.ts 的 getLatestQuarterWithBankAssetQuality 同一種判斷方式）。
export const getLatestQuarterWithBankIncomeStatement = async (symbol: string, dataType: string, subsidiaryCompanyId: string): Promise<{ year: number; quarter: number } | null> => {
  const rows = await mopsExportPrisma.$queryRaw<{ year: number; quarter: number }[]>`
    SELECT year, quarter FROM "export"."bank_income_statement_detail_xbrl"
    WHERE symbol = ${symbol} AND data_type = ${dataType} AND subsidiary_company_id = ${subsidiaryCompanyId} AND net_income_loss_of_interest_quarter IS NOT NULL
    ORDER BY year DESC, quarter DESC LIMIT 1
  `;
  return rows[0] ?? null;
};
