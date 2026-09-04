import { twseExportPrisma } from '@/adapters/prisma/twseExportClient';
import { analysisPrisma } from '@/adapters/prisma/analysisClient';
import { logger } from '@/shared/logger';

// 產業代碼對照表——之後做 Mohanram_G_Score/Greenblatt_Magic_Formula 這類需要「跟同產業其他公司比較」
// 的指標時會用到，目前只負責在伺服器啟動時抓下來放記憶體，還沒有任何指標真的在用。
//
// 2026-09-04 改用 twse-ts 的 export.industry_code view（兩碼產業代碼 -> 中文產業名稱，
// 40 筆，已實測確認 dev/prod 都有資料）取代原本 localhost:8081 + TASK_SECRET 的 dev-only
// HTTP 機制——原本那個機制不穩定（dev server 常常抓失敗），而且正式環境本來就打不到
// localhost，現在改成跟其他資料源一樣走 twseExportPrisma，dev/prod 都能跑，不用再分流。
export type IndustryCodeMap = Record<string, string>;

interface RawIndustryCodeRow {
  code: string;
  name: string;
}

const MAX_ATTEMPTS = 2; // 抓失敗最多重試一次（總共嘗試 2 次），不是無限重試。

let industryCodes: IndustryCodeMap | null = null;

const fetchIndustryCodesOnce = async (): Promise<IndustryCodeMap> => {
  const rows = await twseExportPrisma.$queryRaw<RawIndustryCodeRow[]>`
    SELECT code, name FROM "export"."industry_code"
  `;
  if (rows.length === 0) throw new Error('export.industry_code 查回來是空的。');
  return Object.fromEntries(rows.map((row) => [row.code, row.name]));
};

// 抓成功後存進 oingg-analysis DB 的 reference_industry_code，供之後「抓不到的時候頂著用」。
// 存檔失敗不應該讓這次已經抓到、可以直接用的結果算失敗——跟其他指標「算完存進 DB，存檔失敗
// 不影響本次回傳」是同一種容錯原則。
const persistIndustryCodes = async (codes: IndustryCodeMap): Promise<void> => {
  try {
    await Promise.all(
      Object.entries(codes).map(([code, name]) =>
        analysisPrisma.industryCode.upsert({
          where: { code },
          create: { code, name },
          update: { name },
        })
      )
    );
  } catch (error) {
    logger.error({ err: error }, '[industry-codes]: 寫入 reference_industry_code 失敗，不影響本次抓到的結果。');
  }
};

// 從 reference_industry_code 讀上次成功抓到、存下來的對照表，當作 twse-ts export DB 這次連不上時
// 的備援——不保證是最新的（產業分類本來就很少變動，舊一點的對照表通常還是堪用），有總比完全沒有好。
const loadIndustryCodesFromDb = async (): Promise<IndustryCodeMap | null> => {
  const rows = await analysisPrisma.industryCode.findMany();
  if (rows.length === 0) return null;
  return Object.fromEntries(rows.map((row) => [row.code, row.name]));
};

// 伺服器啟動時嘗試抓一次產業代碼對照表——這是輔助性質的參考資料，不是啟動必要條件，跟
// connectDb/connectAnalysisDb 那種「連不上就直接讓伺服器啟動失敗」不一樣：這裡失敗最多重試
// 一次就放棄，不拋例外、不擋伺服器啟動、也不會無限重試。改用 twseExportPrisma 之後 dev/prod
// 都會跑，不用再限制只在 dev 環境嘗試。
//
// 抓到就存進 DB（見 persistIndustryCodes）；重試後還是抓不到，改讀 DB 裡上次存的那份頂著用
// （見 loadIndustryCodesFromDb）——兩份資料都沒有才真的放棄。
export const loadIndustryCodes = async (): Promise<void> => {
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    try {
      industryCodes = await fetchIndustryCodesOnce();
      logger.info(`[industry-codes]: 已從 export.industry_code 抓到產業代碼對照表（共 ${Object.keys(industryCodes).length} 筆，第 ${attempt} 次嘗試成功）。`);
      void persistIndustryCodes(industryCodes);
      return;
    } catch (error) {
      logger.warn({ err: error }, `[industry-codes]: 第 ${attempt}/${MAX_ATTEMPTS} 次抓取失敗——`);
    }
  }

  try {
    const fallback = await loadIndustryCodesFromDb();
    if (fallback) {
      industryCodes = fallback;
      logger.warn(`[industry-codes]: 重試 ${MAX_ATTEMPTS} 次後仍失敗，改用 reference_industry_code 裡上次存的對照表頂著用（共 ${Object.keys(fallback).length} 筆）。`);
      return;
    }
  } catch (error) {
    logger.error({ err: error }, '[industry-codes]: 讀 reference_industry_code 備援資料也失敗。');
  }
  logger.warn(`[industry-codes]: 重試 ${MAX_ATTEMPTS} 次後仍失敗，DB 裡也沒有上次存的備援資料，放棄抓取，不影響伺服器啟動（之後也不會自動再重試，除非重啟伺服器）。`);
};

// 目前沒有任何指標在讀這個——先把資料抓下來放著，等真的要做 Mohanram_G_Score 之類的指標時再接上。
export const getIndustryCodes = (): IndustryCodeMap | null => industryCodes;
