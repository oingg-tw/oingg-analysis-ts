import { govExportPrisma } from '@/infrastructure/prisma/govExportClient';

// 資料源是 gov-ts 的財政部稅籍行業標準分類（export.company_industry_classification），五層階層
// section/division/group/class/subclass，每家公司最多 4 組代碼（rank 0=主要，1-3=次要，這裡只用 rank=0）。
//
// 2026-10-02 使用者拍板下架 GET /industries/tree、/industries/flat（bff 8 天 25 萬筆請求 0 次、web-nuxt 零呼叫且沒有規劃、
// 雲端 30 天 0 次，而且只涵蓋 999 家上市公司）：啟動快取、階層樹、攤平路徑全部移除，export.industry_codes 不再讀。
// 這份檔案只剩 Altman Z″ 的製造業判斷。

// 2026-09-13 新增：給 computeAltmanZDoublePrimeScorePit.ts 判斷「是不是製造業」用——
// Z″-Score（1995）是 Altman 專門排除 X5（資產週轉率）給非製造業公司用的版本，section='C'
// 就是財政部稅籍分類的「製造業」（見檔頭的 19 個 section 說明）。刻意不吃
// classificationCache（那個只在伺服器啟動時呼叫 loadIndustryClassification() 才會有值，
// backfill 腳本是獨立執行的 process，不會經過伺服器啟動流程），改直接查一次 DB，跟
// isFinancialIndustryCompany（securitiesIndustry.ts）同一種「不依賴快取，每次呼叫都
// 查詢即時真相」的做法，用量遠低於全市場批次計算等級的頻率，不需要額外快取。
export const getCompanySectionCode = async (symbol: string): Promise<string | null> => {
  const rows = await govExportPrisma.$queryRaw<{ section_code: string | null }[]>`
    SELECT section_code FROM "export"."company_industry_classification" WHERE symbol = ${symbol} AND rank = 0 LIMIT 1
  `;
  return rows[0]?.section_code ?? null;
};
