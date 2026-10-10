// 2026-09-17 clean architecture 重構 Phase 1：整個服務唯一讀 process.env 的地方（oxlint 的
// no-restricted-properties 規則強制）。原本 8 個 Prisma client 各自讀裸 process.env、缺變數要到
// 真的連線時才炸、正式環境的 BFF_API_KEY 檢查另外寫在 index.ts——現在集中在這裡用 zod 一次
// 驗證完，import 這個模組的當下就會失敗並列出缺了哪些變數。
//
// .env 一定要在任何 Prisma client 建構之前載入（Prisma 7 driver adapter 沒有 Prisma 5/6 那種
// env() datasource 內建自動載入）——所有 client 都 import 這個模組，所以在這裡載一次就夠，
// client 自己不用再各自 `import 'dotenv/config'`。
import 'dotenv/config';
import { z } from 'zod';

const nonEmpty = z.string().min(1);

const envSchema = z
  .object({
    NODE_ENV: z.string().optional(),
    PORT: z.coerce.number().int().positive().default(3000),
    // api/bff 跟 bff-ts 約定的共用密鑰（X-Api-Key），見 src/http/middleware/businessAuth.ts——本機開發
    // 可以不設（直接放行），正式環境一定要設（下方 superRefine），不要悄悄退化成不驗證。
    // 2026-10-10 詞彙表：服務正名「業務中台」，環境變數官方名 BUSINESS_API_KEY；舊名 BFF_API_KEY 仍可用（優先讀新名），
    // 部署設定（deploy/*.yaml、Cloud Run secret）的改名由使用者決定時程。
    BUSINESS_API_KEY: nonEmpty.optional(),
    BFF_API_KEY: nonEmpty.optional(),
    // 沒設就依環境決定（正式 info、開發 debug，見 logger.ts）；測試 harness 設 'silent'。
    LOG_LEVEL: nonEmpty.optional(),
    ANALYSIS_DATABASE_URL: nonEmpty,
    MOPS_EXPORT_DATABASE_URL: nonEmpty,
    GOV_EXPORT_DATABASE_URL: nonEmpty,
    // twse-ts：刻意固定連 PROD（見 prisma/twseExportClient.ts 的說明）。2026-09-23 拿掉了
    // TWSE_EXPORT_DATABASE_URL_DEV——它當初只為了月營收存在（那批資料一度只有 DEV 有），
    // twse-ts 完成上市全市場回填後 PROD 才是正確來源，那條連線已無消費端。
    TWSE_EXPORT_DATABASE_URL: nonEmpty,
    // tpex-ts / sitca-ts：2026-10-08 使用者定案「開發環境是 readonly，直接連正式環境的後台資料也沒關係」——跟 twse-ts 一樣固定連 PROD，
    // 本機開發不再讀上游的 DEV 庫（DEV 庫會落後、需要時還得請上游倒資料）。雲端的開發環境（service-dev.yaml）本來就讀 PROD。
    // analysis 自己的資料庫照樣分兩個分支（DEV 給 development 分支、PRD 給 master），只有上游唯讀資料共用。
    TPEX_EXPORT_DATABASE_URL_PROD: nonEmpty,
    SITCA_EXPORT_DATABASE_URL_PROD: nonEmpty,
    // 2026-09-30 上游變動通知（POST /upstream/changes）：每個來源一把金鑰（X-Upstream-Key），沒設的來源在正式環境一律拒絕；
    // 處理程式的 Cloud Run Job 完整名稱（projects/…/locations/…/jobs/…），沒設就不自動叫醒（本機手動跑處理腳本）。
    UPSTREAM_KEY_MOPS: nonEmpty.optional(),
    UPSTREAM_KEY_TPEX: nonEmpty.optional(),
    UPSTREAM_KEY_TWSE: nonEmpty.optional(),
    UPSTREAM_PROCESSOR_JOB: nonEmpty.optional(),
  })
  .superRefine((env, ctx) => {
    const isProduction = env.NODE_ENV === 'production';
    if (isProduction && !env.BUSINESS_API_KEY && !env.BFF_API_KEY) {
      ctx.addIssue({ code: 'custom', path: ['BUSINESS_API_KEY'], message: '正式環境一定要有業務中台的共用密鑰（BUSINESS_API_KEY，舊名 BFF_API_KEY）才能啟動，見 src/http/middleware/businessAuth.ts。' });
    }
  });

const parsed = envSchema.safeParse(process.env);
if (!parsed.success) {
  const lines = parsed.error.issues.map((issue) => `  - ${issue.path.join('.') || '(root)'}: ${issue.message}`);
  throw new Error(`環境變數設定錯誤（見 .env / 部署設定）：\n${lines.join('\n')}`);
}
const env = parsed.data;
const isProduction = env.NODE_ENV === 'production';

export const config = {
  isProduction,
  port: env.PORT,
  businessApiKey: env.BUSINESS_API_KEY ?? env.BFF_API_KEY ?? null,
  logLevel: env.LOG_LEVEL ?? null,
  upstreamKeys: { mops: env.UPSTREAM_KEY_MOPS ?? null, tpex: env.UPSTREAM_KEY_TPEX ?? null, twse: env.UPSTREAM_KEY_TWSE ?? null },
  upstreamProcessorJob: env.UPSTREAM_PROCESSOR_JOB ?? null,
  db: {
    analysis: env.ANALYSIS_DATABASE_URL,
    mopsExport: env.MOPS_EXPORT_DATABASE_URL,
    govExport: env.GOV_EXPORT_DATABASE_URL,
    twseExport: env.TWSE_EXPORT_DATABASE_URL,
    tpexExport: env.TPEX_EXPORT_DATABASE_URL_PROD,
    sitcaExport: env.SITCA_EXPORT_DATABASE_URL_PROD,
  },
};
