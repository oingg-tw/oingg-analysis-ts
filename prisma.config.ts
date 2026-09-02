import 'dotenv/config';
import { defineConfig, env } from 'prisma/config';

// Prisma 7 只會自動載入專案根目錄「一個」設定檔，但本服務有 8 個各自獨立的 schema/資料庫
// （不是大多數專案假設的單一 schema），CLI 指令（generate/db pull/migrate/studio）沿用既有的
// `--schema=prisma/xxx/schema.prisma` 慣例（見 package.json 的 prisma:*:pull/studio 腳本），
// 這裡依當次命令實際傳的 --schema 動態決定要用哪組連線字串，不是寫死一個。
//
// 這裡只影響 CLI，執行期的 client 完全不讀這個檔案——見 src/adapters/prisma/*.ts 各自的
// PrismaPg({ connectionString }) 說明。CLI 用的是「非 pooled」直連字串（DIRECT_URL 系列），
// 不是 runtime 用的 pooled DATABASE_URL——這是 Neon/PgBouncer 官方建議的分法：migrate 需要
// advisory lock/DDL，PgBouncer transaction pooling 模式下無法正確處理。
const schemaArg = (() => {
  const eq = process.argv.find((arg) => arg.startsWith('--schema='));
  if (eq) return eq.split('=')[1];
  const idx = process.argv.indexOf('--schema');
  return idx !== -1 ? process.argv[idx + 1] : undefined;
})();

// tpexExport/sitcaExport 兩個 schema 沒有 non-pooled 的 DIRECT_URL 環境變數（sitca-ts/tpex-ts
// 給的是 dev/prod 兩個獨立 Neon 專案的 pooled 連線，沒有另外提供直連字串）——這兩個 CLI 只有
// 偶爾手動跑 db pull/studio 會用到，退回用 DEV 的 pooled 連線頂著，這是延續升級前就有的既有
// 限制，不是這次升級造成的新問題。
const DIRECT_URL_BY_SCHEMA: Record<string, string | undefined> = {
  'prisma/schema.prisma': env('DIRECT_URL'),
  'prisma/analysis/schema.prisma': env('ANALYSIS_DIRECT_URL'),
  'prisma/twse/schema.prisma': env('TWSE_DIRECT_URL'),
  'prisma/gov/schema.prisma': env('GOV_DIRECT_URL'),
  'prisma/mopsExport/schema.prisma': env('MOPS_EXPORT_DIRECT_URL'),
  'prisma/govExport/schema.prisma': env('GOV_EXPORT_DIRECT_URL'),
  'prisma/tpexExport/schema.prisma': env('TPEX_EXPORT_DATABASE_URL_DEV'),
  'prisma/sitcaExport/schema.prisma': env('SITCA_EXPORT_DATABASE_URL_DEV'),
};

const resolvedSchema = schemaArg ?? 'prisma/schema.prisma';

export default defineConfig({
  schema: resolvedSchema,
  migrations: { path: 'prisma/analysis/migrations' }, // 只有 analysis schema 真的有 migrations 目錄，本服務自己擁有的唯一一個。
  datasource: {
    url: DIRECT_URL_BY_SCHEMA[resolvedSchema] ?? env('DIRECT_URL'),
  },
});
