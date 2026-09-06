// mops-ts export schema 的 export.xbrl_three_statements_long——「長表」格式（一列一個
// account_code），2026-09-06 這裡查詢的是新增的 statement_type='cash_flow_quarterly'
// （單季反推現金流量表，mops-ts 自己用累計數相減算出來的，跟既有的 'cash_flow'
// statement_type 是累計數不同）。已用 2330 115Q1/115Q2 交叉驗證過：
// cash_flows_from_used_in_operating_activities 分別是 698976265/783364977，跟現有計算
// 來源 quarterly_cash_flow_statement.net_cash_from_operating_activities 完全一致。
//
// 這支查詢層只負責「查得到、pivot 成好用的形狀」，目前沒有任何 PIT 指標或舊架構在用這個
// 資料源——是否要把既有現金流量表依賴的指標換源到這裡，是另一個更大的決定（見
// UBIQUITOUS_LANGUAGE.md／技術債清單裡「XBRL 遷移」那個項目），這裡先不動任何既有計算。

import { mopsExportPrisma } from '@/adapters/prisma/mopsExportClient';

export interface XbrlThreeStatementsLongKey {
  symbol: string;
  year: number;
  quarter: number;
  dataType: string;
  subsidiaryCompanyId: string;
}

export interface XbrlCashFlowQuarterlyRow {
  reportDate: Date;
  // account_code -> 金額（千元，bigint）——跟三大表其他查詢層（mopsQuarterlyStatements.ts）
  // 的金額欄位型別一致。長表本身 value 欄位是 text，這裡統一轉成 bigint。
  accounts: Record<string, bigint>;
}

interface RawLongRow {
  fiscal_period_end_date: Date;
  account_code: string;
  value: string;
}

export const getXbrlCashFlowQuarterly = async (key: XbrlThreeStatementsLongKey): Promise<XbrlCashFlowQuarterlyRow | null> => {
  const rows = await mopsExportPrisma.$queryRaw<RawLongRow[]>`
    SELECT fiscal_period_end_date, account_code, value FROM "export"."xbrl_three_statements_long"
    WHERE symbol = ${key.symbol} AND year = ${key.year} AND quarter = ${key.quarter}
      AND data_type = ${key.dataType} AND subsidiary_company_id = ${key.subsidiaryCompanyId}
      AND statement_type = 'cash_flow_quarterly'
  `;
  if (rows.length === 0) return null;

  const accounts: Record<string, bigint> = {};
  for (const row of rows) {
    accounts[row.account_code] = BigInt(row.value);
  }
  return { reportDate: rows[0]!.fiscal_period_end_date, accounts };
};

// 「列存在即算有資料」——跟 getLatestQuarterWithBalanceSheet 同一種判斷，這個 statement_type
// 沒有觀察到 bankCapitalAdequacy 那種「列存在但值全 null」的陷阱（長表本身沒有 null 列的
// 概念，一個 account_code 有值才會有一列）。
export const getLatestQuarterWithXbrlCashFlowQuarterly = async (
  symbol: string,
  dataType: string,
  subsidiaryCompanyId: string
): Promise<{ year: number; quarter: number } | null> => {
  const rows = await mopsExportPrisma.$queryRaw<{ year: number; quarter: number }[]>`
    SELECT year, quarter FROM "export"."xbrl_three_statements_long"
    WHERE symbol = ${symbol} AND data_type = ${dataType} AND subsidiary_company_id = ${subsidiaryCompanyId}
      AND statement_type = 'cash_flow_quarterly'
    ORDER BY year DESC, quarter DESC LIMIT 1
  `;
  return rows[0] ?? null;
};
