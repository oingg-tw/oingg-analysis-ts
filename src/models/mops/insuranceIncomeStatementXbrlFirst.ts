// 保險業（IFRS17）損益表替代科目查詢層——保險業財報結構沒有「銷貨成本/毛利」概念，
// 一般產業用的 revenue/grossProfit/operatingIncome 在保險業 XBRL 資料裡完全不存在
// （不是 mops-ts parser 漏掉，查證過是 IFRS17 保險合約用專屬 taxonomy）。2026-09-08
// 跟 mops-ts 來回確認、並對照 conductor-ts 的〈非一般行業獲利能力之會計衡量與指標
// 換算架構〉研究筆記，定案三層對照：
//   revenue      -> insurance_revenue（已賺保費淨額性質）
//   grossProfit  -> insurance_service_result（保險服務結果=保險服務收入－保險服務
//                    費用，文件明確定義這是「核心承保毛利」）
//   operatingIncome -> net_operating_income_loss（淨營業損益，概念上等於承保利益+
//                    淨投資損益－營業總開銷）
//
// **關鍵**：export.insurance_income_statement_detail_xbrl 這張表每家公司都有列，
// 不是只有保險業才有——mops-ts 的 ingest 邏輯對每家公司都會嘗試寫入全部產業別的
// detail 表，不適用的產業對應欄位是 null。判斷「這家公司這一季是不是保險業」不能看
// 「有沒有查到列」，要看 insurance_revenue_quarter IS NOT NULL；查無資料或該欄位是
// null 一律回傳 null，呼叫端視為「這條替代路徑不適用」，不是查詢失敗。
//
// 金控業（net_interest_income_expense 等）刻意不做同樣的替代——查過 conductor-ts
// 另一篇研究筆記〈金控業與一般行業獲利能力之會計衡量與指標換算架構〉，金控業的
// margin/turnover 概念結構性不成立（毛利率會無限逼近 100%、總資產週轉率結構性
// 坍塌到 0.02~0.05x），需要的是全新的指標概念（NIM/CIR/Cole 改良杜邦），不是把
// grossMargin/operatingMargin 硬套替代科目，這是使用者確認過的決定，不要在這支
// 檔案的模式上依樣畫葫蘆加金控業支援。

import { mopsExportPrisma } from '@/adapters/prisma/mopsExportClient';
import type { QuarterlyKey } from '../quarterlyKey';

export interface InsuranceIncomeStatementFields {
  reportDate: Date;
  insuranceRevenue: bigint;
  insuranceServiceResult: bigint | null;
  netOperatingIncomeLoss: bigint | null;
}

interface RawInsuranceIncomeStatementRow {
  report_date: Date;
  insurance_revenue_quarter: bigint | null;
  insurance_service_result_quarter: bigint | null;
  net_operating_income_loss_quarter: bigint | null;
}

// 2026-09-08 實作時發現：2851（中再保）在舊架構的 export.quarterly_income_statement
// 完全沒有列（legacy 表覆蓋率本來就只有 ~249 家，保險業不在裡面），代表
// getLatestAvailableQuarter(...,'incomeStatement') 這個既有的「最新一季」解析函式
// 對 2851 一定回傳 null，呼叫端會在還沒機會嘗試保險替代科目之前就先判定
// skipped_no_quarter——這不是保險替代科目本身的問題，是「哪一季有資料」這一步就要
// 先接上保險業的來源。2867（三商美邦人壽）剛好 legacy 表有資料，只是本文件開頭說的
// revenue 缺口在欄位層級，兩家公司踩到的是同一個問題的不同層面，不能只解其中一個。
export const getLatestQuarterWithInsuranceIncomeStatement = async (
  symbol: string,
  dataType: string,
  subsidiaryCompanyId: string
): Promise<{ year: number; quarter: number } | null> => {
  const rows = await mopsExportPrisma.$queryRaw<Array<{ year: number; quarter: number }>>`
    SELECT year, quarter FROM "export"."insurance_income_statement_detail_xbrl"
    WHERE symbol = ${symbol} AND data_type = ${dataType} AND subsidiary_company_id = ${subsidiaryCompanyId}
      AND insurance_revenue_quarter IS NOT NULL
    ORDER BY year DESC, quarter DESC LIMIT 1
  `;
  return rows[0] ?? null;
};

// insurance_revenue_quarter 是判斷「這家公司這一季是不是保險業」的依據，非 null
// 才視為適用——回傳型別把它收窄成非 null（保證有值才會回傳這個物件），呼叫端不用
// 再另外判斷一次。
export const getInsuranceIncomeStatementXbrlFirst = async (key: QuarterlyKey): Promise<InsuranceIncomeStatementFields | null> => {
  const rows = await mopsExportPrisma.$queryRaw<RawInsuranceIncomeStatementRow[]>`
    SELECT report_date, insurance_revenue_quarter, insurance_service_result_quarter, net_operating_income_loss_quarter
    FROM "export"."insurance_income_statement_detail_xbrl"
    WHERE symbol = ${key.symbol} AND year = ${key.year} AND quarter = ${key.quarter}
      AND data_type = ${key.dataType} AND subsidiary_company_id = ${key.subsidiaryCompanyId}
    LIMIT 1
  `;

  const row = rows[0];
  if (!row || row.insurance_revenue_quarter === null) return null;

  return {
    reportDate: row.report_date,
    insuranceRevenue: row.insurance_revenue_quarter,
    insuranceServiceResult: row.insurance_service_result_quarter,
    netOperatingIncomeLoss: row.net_operating_income_loss_quarter,
  };
};
