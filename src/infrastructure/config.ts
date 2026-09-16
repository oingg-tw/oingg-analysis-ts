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
    // api/bff 跟 bff-ts 約定的共用密鑰（X-Api-Key），見 src/http/middleware/bffAuth.ts——本機開發
    // 可以不設（直接放行），正式環境一定要設（下方 superRefine），不要悄悄退化成不驗證。
    BFF_API_KEY: nonEmpty.optional(),
    // 沒設就依環境決定（正式 info、開發 debug，見 logger.ts）；測試 harness 設 'silent'。
    LOG_LEVEL: nonEmpty.optional(),
    ANALYSIS_DATABASE_URL: nonEmpty,
    MOPS_EXPORT_DATABASE_URL: nonEmpty,
    GOV_EXPORT_DATABASE_URL: nonEmpty,
    PLAYWRIGHT_EXPORT_DATABASE_URL: nonEmpty,
    // twse-ts：刻意固定連 PROD（見 prisma/twseExportClient.ts 的說明），月營收另外固定連 DEV
    // （見 prisma/twseExportDevClient.ts），兩條連線在任何環境都需要。
    TWSE_EXPORT_DATABASE_URL: nonEmpty,
    TWSE_EXPORT_DATABASE_URL_DEV: nonEmpty,
    // tpex-ts / sitca-ts：dev/prod 是兩個獨立的 Neon 專案，依執行環境二選一（下方 superRefine
    // 只要求當前環境用得到的那一組存在，正式 image 不需要帶 DEV 的連線字串）。
    TPEX_EXPORT_DATABASE_URL_DEV: nonEmpty.optional(),
    TPEX_EXPORT_DATABASE_URL_PROD: nonEmpty.optional(),
    SITCA_EXPORT_DATABASE_URL_DEV: nonEmpty.optional(),
    SITCA_EXPORT_DATABASE_URL_PROD: nonEmpty.optional(),
  })
  .superRefine((env, ctx) => {
    const isProduction = env.NODE_ENV === 'production';
    if (isProduction && !env.BFF_API_KEY) {
      ctx.addIssue({ code: 'custom', path: ['BFF_API_KEY'], message: '正式環境的 api/bff 一定要有共用密鑰才能啟動，見 src/http/middleware/bffAuth.ts。' });
    }
    const suffix = isProduction ? 'PROD' : 'DEV';
    for (const prefix of ['TPEX_EXPORT_DATABASE_URL', 'SITCA_EXPORT_DATABASE_URL'] as const) {
      const key = `${prefix}_${suffix}` as const;
      if (!env[key]) ctx.addIssue({ code: 'custom', path: [key], message: `${isProduction ? '正式' : '開發'}環境需要 ${key}。` });
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
  bffApiKey: env.BFF_API_KEY ?? null,
  logLevel: env.LOG_LEVEL ?? null,
  db: {
    analysis: env.ANALYSIS_DATABASE_URL,
    mopsExport: env.MOPS_EXPORT_DATABASE_URL,
    govExport: env.GOV_EXPORT_DATABASE_URL,
    playwrightExport: env.PLAYWRIGHT_EXPORT_DATABASE_URL,
    twseExport: env.TWSE_EXPORT_DATABASE_URL,
    twseExportDev: env.TWSE_EXPORT_DATABASE_URL_DEV,
    // superRefine 已保證當前環境用得到的那一組存在。
    tpexExport: (isProduction ? env.TPEX_EXPORT_DATABASE_URL_PROD : env.TPEX_EXPORT_DATABASE_URL_DEV)!,
    sitcaExport: (isProduction ? env.SITCA_EXPORT_DATABASE_URL_PROD : env.SITCA_EXPORT_DATABASE_URL_DEV)!,
  },
};
