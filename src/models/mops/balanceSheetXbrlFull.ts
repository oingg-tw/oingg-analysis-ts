// 「會計模式」端點（GET /companies/financial-statement）專用的完整版資產負債表查詢——
// 跟 balanceSheetXbrlFirst.ts 不一樣：那支是服務內部計算（pitMetrics）用的精簡版，只抽
// 31 支 compute 函式實際會用到的 16 個欄位；這支是給前端會計用戶稽核數字用，2026-09-07
// 使用者要求「必須把能抓的資料都呈現上去」，`SELECT *` 動態濾掉 identity/metadata 欄位，
// 回傳 quarterly_balance_sheet_xbrl 剩下的全部 90 個科目欄位（不手動列舉欄位名稱，之後
// mops-ts 那邊寬表新增欄位會自動跟著出現）。
//
// key 直接沿用資料庫原始 snake_case 欄名（account_code），不轉 camelCase——90 個科目手動
// 維護一份 camelCase 對照表本身就違背「不要手動列舉欄位」的設計初衷，稽核情境下使用者
// 本來就需要拿科目代碼去對照 XBRL 官方分類，原始 snake_case 反而更方便核對。
//
// 2026-09-11：舊三大表（quarterly_balance_sheet，mopsQuarterlyStatements.ts）已退役，
// 不再有 fallback 分支——查無 XBRL 列直接回傳 null（found: false），不再退回 camelCase
// 版本的舊表資料。
//
// 回傳值刻意不在這裡把 bigint/numeric 轉成字串——維持原始型別，交給呼叫端既有的
// serializeStatementRow（controller.ts）統一序列化。

import type { QuarterlyKey } from '../quarterlyKey';
import { mopsExportPrisma } from '@/adapters/prisma/mopsExportClient';

const IDENTITY_COLUMNS = new Set(['symbol', 'year', 'quarter', 'data_type', 'subsidiary_company_id', 'report_date', 'raw_context_ref', 'created_at', 'updated_at']);

export const getBalanceSheetXbrlFull = async (key: QuarterlyKey): Promise<object | null> => {
  const rows = await mopsExportPrisma.$queryRaw<Record<string, unknown>[]>`
    SELECT * FROM "export"."quarterly_balance_sheet_xbrl"
    WHERE symbol = ${key.symbol} AND year = ${key.year} AND quarter = ${key.quarter}
      AND data_type = ${key.dataType} AND subsidiary_company_id = ${key.subsidiaryCompanyId}
    LIMIT 1
  `;

  const row = rows[0];
  if (!row) return null;

  const reportDate = row.report_date as Date;
  const fields: Record<string, unknown> = {};
  for (const [column, value] of Object.entries(row)) {
    if (IDENTITY_COLUMNS.has(column)) continue;
    fields[column] = value;
  }
  return { reportDate, ...fields };
};
