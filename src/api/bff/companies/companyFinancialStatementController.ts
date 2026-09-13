import { type Request, type Response, type NextFunction } from 'express';
import { z } from 'zod';
import { getLatestAvailableQuarter, type StatementSource } from '@/shared/sourceData/latestQuarter';
import { getBalanceSheetXbrlFull } from '@/shared/sourceData/balanceSheetXbrlFull';
import { getIncomeStatementXbrlFull } from '@/shared/sourceData/incomeStatementXbrlFull';
import { getXbrlCashFlowQuarterly } from '@/shared/sourceData/xbrlCashFlowQuarterly';
import type { Season } from '@/shared/rocQuarter';

const FINANCIAL_STATEMENT_TYPES = ['balanceSheet', 'incomeStatement', 'cashFlowStatement'] as const;

export const getCompanyFinancialStatementQuerySchema = z
  .object({
    symbol: z.string({ error: 'symbol is required.' }).min(1).meta({ description: '公司代號', example: '2330' }),
    statementType: z
      .enum(FINANCIAL_STATEMENT_TYPES, { error: 'statementType is required, 必須是 balanceSheet/incomeStatement/cashFlowStatement 之一。' })
      .meta({ description: '會計模式要看哪一張表：balanceSheet(資產負債表)/incomeStatement(損益表)/cashFlowStatement(現金流量表)', example: 'balanceSheet' }),
    year: z
      .string()
      .regex(/^\d{2,3}$/, 'year 必須是民國年數字字串，例如 "115"。')
      .optional()
      .meta({ description: '民國年，例如 "115"；跟 season 要成對提供，不給就自動抓該張表最新一季', example: '115' }),
    season: z.enum(['1', '2', '3', '4']).optional().meta({ description: '季別 1-4；跟 year 要成對提供' }),
  })
  .refine((data) => (data.year === undefined) === (data.season === undefined), {
    message: 'year 和 season 必須成對提供，只給其中一個是無效請求。',
    path: ['season'],
  });

// object（不是 Record<string, unknown>）——這幾支 getXxx 函式各自回傳不同形狀的物件，
// 有些是具名 interface（沒有索引簽章，賦值到 Record<string, unknown> 會被 TS 拒絕），
// 有些是動態欄位的泛化物件；object 沒有這個限制，取用時再用 Object.entries 轉成一般
// 物件遍歷。
type FinancialStatementRow = object;

// 現金流量表沒有 XBRL 寬表，是長表格式（xbrl_three_statements_long），
// getXbrlCashFlowQuarterly 回傳 { reportDate, accounts: Record<string, bigint> }——這裡
// 把 accounts 攤平成跟 balanceSheet/incomeStatement 一致的扁平物件形狀。2026-09-11
// 舊三大表（quarterly_cash_flow_statement，mopsQuarterlyStatements.ts）已退役，查無
// XBRL 資料直接回傳 null，不再 fallback。
const getCashFlowStatementXbrlFull = async (key: {
  symbol: string;
  year: number;
  quarter: number;
  dataType: string;
  subsidiaryCompanyId: string;
}): Promise<FinancialStatementRow | null> => {
  const xbrl = await getXbrlCashFlowQuarterly(key);
  return xbrl ? { reportDate: xbrl.reportDate, ...xbrl.accounts } : null;
};

const STATEMENT_FETCHERS: Record<
  (typeof FINANCIAL_STATEMENT_TYPES)[number],
  (key: { symbol: string; year: number; quarter: number; dataType: string; subsidiaryCompanyId: string }) => Promise<FinancialStatementRow | null>
> = {
  balanceSheet: getBalanceSheetXbrlFull,
  incomeStatement: getIncomeStatementXbrlFull,
  cashFlowStatement: getCashFlowStatementXbrlFull,
};

// 三張表的 identity 欄位（symbol/year/quarter/dataType/subsidiaryCompanyId/reportDate）
// 已經在回應最外層給過一次，statement 物件裡只留純科目欄位，不重複。
const STATEMENT_IDENTITY_FIELDS = new Set(['symbol', 'year', 'quarter', 'dataType', 'subsidiaryCompanyId', 'reportDate']);

// 財報金額欄位都是 bigint，序列化成字串避免 JS 數字精度問題——跟 companyProfileDetailSchema
// 的 paidInCapital 那批欄位同一個慣例。非 bigint 的欄位（例如 XBRL numeric 型別）原樣
// 透傳，不強制轉型。
const serializeStatementRow = (row: FinancialStatementRow): Record<string, string | null> => {
  const result: Record<string, string | null> = {};
  for (const [key, value] of Object.entries(row as Record<string, unknown>)) {
    if (STATEMENT_IDENTITY_FIELDS.has(key)) continue;
    result[key] = typeof value === 'bigint' ? value.toString() : (value as string | null);
  }
  return result;
};

// 「會計模式」用——前端選定一張表（資產負債表/損益表/現金流量表），一次拿到該季全部科目
// 欄位（不是算好的單一比率），符合傳統看報表的習慣，跟 point-in-time 那套算好的指標歷史
// （roe-history 那些）刻意分開，資料來源相同（mops-ts 的三張季報表 export view），只是
// 這裡整列透傳不做任何計算。dataType 固定用合併報表（'2'）、subsidiaryCompanyId 固定空
// 字串——跟 metric-history 同一個慣例，不對外曝露這兩個內部參數。查無資料（該公司這張表
// 完全沒有資料，或指定的 year/season 那一季沒有資料）回傳 200 + found:false，不是 404，
// 跟 roe-history/capital-stock-history 同一種「查無歷史資料是正常情境」的慣例。
export const getCompanyFinancialStatement = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const validationResult = getCompanyFinancialStatementQuerySchema.safeParse(req.query);
    if (!validationResult.success) {
      return res.status(400).json({ message: 'Invalid query parameters.', errors: validationResult.error.format() });
    }

    const { symbol, statementType, year, season } = validationResult.data;
    const dataType = '2';
    const subsidiaryCompanyId = '';

    const resolvedQuarter =
      year !== undefined && season !== undefined
        ? { year, season: season as Season }
        : await getLatestAvailableQuarter(symbol, dataType, subsidiaryCompanyId, [statementType as StatementSource]);

    if (!resolvedQuarter) {
      return res.status(200).json({ symbol, statementType, dataType, subsidiaryCompanyId, year: null, season: null, reportDate: null, found: false, statement: null });
    }

    const key = { symbol, year: Number(resolvedQuarter.year), quarter: Number(resolvedQuarter.season), dataType, subsidiaryCompanyId };
    const row = await STATEMENT_FETCHERS[statementType](key);

    if (!row) {
      return res.status(200).json({
        symbol,
        statementType,
        dataType,
        subsidiaryCompanyId,
        year: resolvedQuarter.year,
        season: resolvedQuarter.season,
        reportDate: null,
        found: false,
        statement: null,
      });
    }

    const reportDate = (row as { reportDate: Date }).reportDate;
    res.status(200).json({
      symbol,
      statementType,
      dataType,
      subsidiaryCompanyId,
      year: resolvedQuarter.year,
      season: resolvedQuarter.season,
      reportDate: reportDate.toISOString().slice(0, 10),
      found: true,
      statement: serializeStatementRow(row),
    });
  } catch (error) {
    next(error);
  }
};
