// 「會計模式」端點（GET /companies/financial-statement）專用的完整版損益表查詢——跟
// incomeStatementXbrlFirst.ts 不一樣：那支是服務內部計算（pitMetrics）用的精簡版，只抽
// 11 支 compute 函式實際會用到的欄位；這支是給前端會計用戶稽核數字用，`SELECT *` 動態
// 濾掉 identity/metadata 欄位，回傳 quarterly_income_statement_xbrl 剩下的全部 48 個科目
// 欄位。設計理由、key 命名慣例（原始 snake_case，不轉 camelCase）、序列化策略（不在這裡
// 轉字串，交給 serializeStatementRow 統一處理）都跟 balanceSheetXbrlFull.ts 完全一致，
// 見那支檔案的檔頭說明。

import type { QuarterlyKey } from './mopsQuarterlyStatements';
import { getQuarterlyIncomeStatement } from './mopsQuarterlyStatements';
import { mopsExportPrisma } from '@/adapters/prisma/mopsExportClient';

const IDENTITY_COLUMNS = new Set(['symbol', 'year', 'quarter', 'data_type', 'subsidiary_company_id', 'report_date', 'raw_context_ref', 'created_at', 'updated_at']);

export const getIncomeStatementXbrlFull = async (key: QuarterlyKey): Promise<object | null> => {
  const rows = await mopsExportPrisma.$queryRaw<Record<string, unknown>[]>`
    SELECT * FROM "export"."quarterly_income_statement_xbrl"
    WHERE symbol = ${key.symbol} AND year = ${key.year} AND quarter = ${key.quarter}
      AND data_type = ${key.dataType} AND subsidiary_company_id = ${key.subsidiaryCompanyId}
    LIMIT 1
  `;

  const row = rows[0];
  if (row) {
    const reportDate = row.report_date as Date;
    const fields: Record<string, unknown> = {};
    for (const [column, value] of Object.entries(row)) {
      if (IDENTITY_COLUMNS.has(column)) continue;
      fields[column] = value;
    }
    return { reportDate, ...fields };
  }

  // 完全查無 XBRL 列——整批 fallback 舊三大表（camelCase，欄位數量比較少但至少有資料）。
  return getQuarterlyIncomeStatement(key);
};
