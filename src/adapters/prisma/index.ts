// Prisma 5/6 的 schema 內建 env("DATABASE_URL") 解析背後有一套 Prisma Client 自己內建的
// 自動 .env 載入邏輯，跟應用程式碼有沒有 import 'dotenv/config' 無關——這也是為什麼這個專案
// 的測試檔案/scratch script 從來沒有人手動 import dotenv 也一直能動。改用 driver adapter 後，
// 連線字串是「我們自己」讀 process.env 組出來的（見下面 PrismaPg 那行），Prisma 不會再幫忙
// 做這件事，所以這裡要自己確保 .env 已經載入——2026-09-02 實測踩過：沒加這行，只要這個檔案
// 在其他地方 import 'dotenv/config' 之前被 import 到，process.env.DATABASE_URL 在建構
// PrismaPg 當下就是 undefined，會用 pg 預設值連到 localhost:5432 噴 ECONNREFUSED，且因為
// connectionString 是建構當下就固定死的值，之後 process.env 就算補上也救不回來。8 個 client
// 檔案都各自 import 這行，dotenv 內部有做過重複載入不覆蓋既有值的防呆，不會互相打架。
import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { config } from '@/shared/config';

// Prisma 7 driver adapter——連線字串不再放 schema.prisma 的 datasource（那邊只留
// provider = "postgresql"），改成這裡明確傳給 PrismaPg。跑 PgBouncer transaction pooling
// 一定要在連線字串帶 pgbouncer=true（見 .env），不然會關掉 Prisma 自己的 prepared statement
// 快取失敗，噴 "prepared statement already exists"——這條是跟 twse-ts/tpex-ts/sitca-ts
// 三邊都各自確認過的同一個坑。
const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });

// Instantiate a single PrismaClient instance to be used across the application.
// 本服務只讀（見 prisma/schema.prisma 開頭註解），永遠不對這些表跑 write/migrate。
export const prisma = new PrismaClient({
  adapter,
  // 開發模式下也不印 'query'——每支 query 都會印出完整 SQL，本地/測試輸出被灌爆，
  // 真的要看 SQL 再臨時改這裡，不要常態開著。
  log: config.isProduction ? ['error'] : ['info', 'warn', 'error'],
});

export const connectDb = async () => {
  try {
    await prisma.$connect();
    console.log('[db]: Connected to database.');
  } catch (error) {
    console.error('[db]: Could not connect to the database.', error);
    throw error; // Re-throw to be caught by the server starter and prevent server from starting.
  }
};

export default prisma;
