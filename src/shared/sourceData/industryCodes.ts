import { analysisPrisma } from '@/adapters/prisma/analysisClient';
import { config } from '../config';

// 產業代碼對照表——之後做 Mohanram_G_Score/Greenblatt_Magic_Formula 這類需要「跟同產業其他公司比較」
// 的指標時會用到，目前只負責在 dev 環境啟動時抓下來放記憶體，還沒有任何指標真的在用。
//
// 實際回應格式（2026-08-30 實測確認，不是原本假設的陣列）：
// { ok: true, count: 40, codes: { "24": "半導體業", "17": "金融保險業", ... } }
// key 是兩碼產業代碼字串，value 是中文產業名稱。
export type IndustryCodeMap = Record<string, string>;

interface IndustryCodesResponse {
  ok: boolean;
  count: number;
  codes: IndustryCodeMap;
}

const INDUSTRY_CODES_URL = 'http://localhost:8081/api/reference/industry-codes';
const MAX_ATTEMPTS = 2; // 抓失敗最多重試一次（總共嘗試 2 次），不是無限重試。

let industryCodes: IndustryCodeMap | null = null;

// 對方本機開發環境的驗證只有一層：X-Task-Secret 要跟對方 .env 裡的 TASK_SECRET 一致（對方用
// crypto.timingSafeEqual 比對，那是伺服器端的事，我們身為呼叫端只需要把值送對）。這裡讀的是
// 「我們自己」.env 裡的 TASK_SECRET——這個值本身是雙方約定好的共用密鑰，要跟對方環境變數裡的
// TASK_SECRET 完全一樣，不是我們自己隨便生一個。沒有設定的話直接跳過整次抓取（送一個錯的值
// 只會拿到 401，沒有意義），並提醒使用者去 .env 補上這個值——正式環境（Cloud Run）那層 GCP IAM
// 驗證不在這裡處理，因為 loadIndustryCodes 本來就只在 dev 環境執行，不會打正式環境的網址。
const fetchIndustryCodesOnce = async (): Promise<IndustryCodeMap> => {
  const taskSecret = process.env.TASK_SECRET;
  if (!taskSecret) {
    throw new Error('環境變數 TASK_SECRET 未設定——請在 .env 加上跟對方服務約定好的共用密鑰，否則一定會拿到 401。');
  }
  const response = await fetch(INDUSTRY_CODES_URL, { headers: { 'X-Task-Secret': taskSecret } });
  if (!response.ok) throw new Error(`HTTP ${response.status} ${response.statusText}`);
  const body: IndustryCodesResponse = await response.json();
  return body.codes;
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
    console.error('[industry-codes]: 寫入 reference_industry_code 失敗，不影響本次抓到的結果。', error);
  }
};

// 從 reference_industry_code 讀上次成功抓到、存下來的對照表，當作 localhost:8081 這次連不上/
// 驗證失敗時的備援——不保證是最新的（產業分類本來就很少變動，舊一點的對照表通常還是堪用），
// 有總比完全沒有好。
const loadIndustryCodesFromDb = async (): Promise<IndustryCodeMap | null> => {
  const rows = await analysisPrisma.industryCode.findMany();
  if (rows.length === 0) return null;
  return Object.fromEntries(rows.map((row) => [row.code, row.name]));
};

// dev 環境啟動時嘗試抓一次產業代碼對照表——這是輔助性質的參考資料，不是啟動必要條件，
// 跟 connectDb/connectAnalysisDb 那種「連不上就直接讓伺服器啟動失敗」不一樣：這裡失敗最多
// 重試一次就放棄，不拋例外、不擋伺服器啟動、也不會無限重試。只在 dev 環境嘗試，因為
// localhost:8081 是本機開發服務，正式環境不會有（也不應該讓正式環境去打一個本機網址）。
//
// 抓到就存進 DB（見 persistIndustryCodes）；重試後還是抓不到，改讀 DB 裡上次存的那份頂著用
// （見 loadIndustryCodesFromDb）——兩份資料都沒有才真的放棄。
export const loadIndustryCodes = async (): Promise<void> => {
  if (config.isProduction) return;

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    try {
      industryCodes = await fetchIndustryCodesOnce();
      console.log(`[industry-codes]: 已從 ${INDUSTRY_CODES_URL} 抓到產業代碼對照表（共 ${Object.keys(industryCodes).length} 筆，第 ${attempt} 次嘗試成功）。`);
      void persistIndustryCodes(industryCodes);
      return;
    } catch (error) {
      console.warn(`[industry-codes]: 第 ${attempt}/${MAX_ATTEMPTS} 次抓取失敗——`, error instanceof Error ? error.message : error);
    }
  }

  try {
    const fallback = await loadIndustryCodesFromDb();
    if (fallback) {
      industryCodes = fallback;
      console.warn(`[industry-codes]: 重試 ${MAX_ATTEMPTS} 次後仍失敗，改用 reference_industry_code 裡上次存的對照表頂著用（共 ${Object.keys(fallback).length} 筆）。`);
      return;
    }
  } catch (error) {
    console.error('[industry-codes]: 讀 reference_industry_code 備援資料也失敗。', error);
  }
  console.warn(`[industry-codes]: 重試 ${MAX_ATTEMPTS} 次後仍失敗，DB 裡也沒有上次存的備援資料，放棄抓取，不影響伺服器啟動（之後也不會自動再重試，除非重啟伺服器）。`);
};

// 目前沒有任何指標在讀這個——先把資料抓下來放著，等真的要做 Mohanram_G_Score 之類的指標時再接上。
export const getIndustryCodes = (): IndustryCodeMap | null => industryCodes;
