import { mopsExportPrisma } from '@/adapters/prisma/mopsExportClient';
import type { QuarterlyKey } from './quarterlyKey';

// 2026-09-11 應 web-nuxt/bff-ts 要求新增（mops-ts 的 export.audit_scope_xbrl，2026-09-10
// 起就緒）——查核意見類型，5 個互斥的 'Y'/null 旗標：qualified_opinion（保留意見）/
// unqualified_opinion（無保留意見）/unqualified_opinion_with_emphasis（無保留意見但有
// 強調事項段）/unqualified_opinion_with_going_concern（繼續經營重大不確定性）/
// disclaimer_of_opinion（無法表示意見）。mops-ts 提醒還缺「否定意見」這個分類（沒遇過
// 真實案例所以故意沒建），5 個旗標全 null 代表落在未涵蓋分類或文件本身沒揭露意見。
//
// 使用者拍板：編碼成 0~4 的序列風險分數（riskScore），符合會計學文獻的回溯嚴重度排序
// （無保留意見最乾淨→無法表示意見最嚴重），給 pitMetrics 的數字 value 用；label 是給
// GET /companies/profile 顯示用的人類可讀中文說明，兩者共用同一個對照表，不要分開維護。

export interface AuditOpinionFields {
  reportDate: Date;
  riskScore: number | null;
  label: string | null;
}

interface RawAuditScopeRow {
  report_date: Date;
  qualified_opinion: string | null;
  unqualified_opinion: string | null;
  unqualified_opinion_with_emphasis: string | null;
  unqualified_opinion_with_going_concern: string | null;
  disclaimer_of_opinion: string | null;
}

// 依會計學文獻的嚴重度排序（由輕到重），不是資料庫欄位順序。
const AUDIT_OPINION_SCALE: { flag: keyof Omit<RawAuditScopeRow, 'report_date'>; score: number; label: string }[] = [
  { flag: 'unqualified_opinion', score: 0, label: '無保留意見' },
  { flag: 'unqualified_opinion_with_emphasis', score: 1, label: '無保留意見（強調事項段）' },
  { flag: 'unqualified_opinion_with_going_concern', score: 2, label: '繼續經營重大不確定性' },
  { flag: 'qualified_opinion', score: 3, label: '保留意見' },
  { flag: 'disclaimer_of_opinion', score: 4, label: '無法表示意見' },
];

const resolveOpinion = (row: RawAuditScopeRow): { riskScore: number | null; label: string | null } => {
  for (const { flag, score, label } of AUDIT_OPINION_SCALE) {
    if (row[flag] === 'Y') return { riskScore: score, label };
  }
  return { riskScore: null, label: null };
};

const AUDIT_SCOPE_COLUMNS = `report_date, qualified_opinion, unqualified_opinion, unqualified_opinion_with_emphasis,
  unqualified_opinion_with_going_concern, disclaimer_of_opinion`;

export const getLatestQuarterWithAuditOpinionXbrl = async (symbol: string, dataType: string, subsidiaryCompanyId: string): Promise<{ year: number; quarter: number } | null> => {
  const rows = await mopsExportPrisma.$queryRaw<{ year: number; quarter: number }[]>`
    SELECT year, quarter FROM "export"."audit_scope_xbrl"
    WHERE symbol = ${symbol} AND data_type = ${dataType} AND subsidiary_company_id = ${subsidiaryCompanyId}
    ORDER BY year DESC, quarter DESC LIMIT 1
  `;
  return rows[0] ?? null;
};

export const getAuditOpinionXbrlFirst = async (key: QuarterlyKey): Promise<AuditOpinionFields | null> => {
  const rows = await mopsExportPrisma.$queryRawUnsafe<RawAuditScopeRow[]>(
    `SELECT ${AUDIT_SCOPE_COLUMNS} FROM "export"."audit_scope_xbrl"
     WHERE symbol = $1 AND year = $2 AND quarter = $3 AND data_type = $4 AND subsidiary_company_id = $5 LIMIT 1`,
    key.symbol,
    key.year,
    key.quarter,
    key.dataType,
    key.subsidiaryCompanyId
  );
  const row = rows[0];
  if (!row) return null;
  return { reportDate: row.report_date, ...resolveOpinion(row) };
};

// 給 GET /companies/profile 用——單一公司查詢，不分期別，直接抓最新一筆（合併報表
// dataType='2'，跟本服務其他「單一公司概覽」欄位的既有預設一致）。查無資料回傳 null，
// 呼叫端視為「查不到查核意見資料」的正常情境，不是查詢失敗。
export const getLatestAuditOpinion = async (symbol: string): Promise<AuditOpinionFields | null> => {
  const rows = await mopsExportPrisma.$queryRawUnsafe<RawAuditScopeRow[]>(
    `SELECT ${AUDIT_SCOPE_COLUMNS} FROM "export"."audit_scope_xbrl"
     WHERE symbol = $1 AND data_type = '2' AND subsidiary_company_id = ''
     ORDER BY year DESC, quarter DESC LIMIT 1`,
    symbol
  );
  const row = rows[0];
  if (!row) return null;
  return { reportDate: row.report_date, ...resolveOpinion(row) };
};
