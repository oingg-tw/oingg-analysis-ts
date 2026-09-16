import supertest from 'supertest';
import { createApp } from '@/bootstrap/app';
import { warmCaches } from '@/bootstrap/warmCaches';
import { disconnectAllDbs } from '@/bootstrap/db';

// HTTP 契約測試用的 in-process app：不 listen 固定 port（那正是 EADDRINUSE 殭屍程序的來源），
// supertest 對不是 function 的 app 物件會自己 `listen(0)` 拿 ephemeral port，但不會幫忙關，
// 所以 close() 一定要在 afterAll 呼叫，Prisma 連線也要斷掉 process 才會結束。
// BFF_API_KEY 由 tests/contract/setup.ts 固定成 'test-key'。
export const API_KEY = 'test-key';

export const startApp = async () => {
  const app = createApp();
  // 依賴啟動快取的端點（peer-group、chain-tree、industries/*…）要等快取載完才有資料。
  await warmCaches();
  const api = supertest(app as unknown as Parameters<typeof supertest>[0]);
  return {
    api,
    close: async () => {
      (app as unknown as { close?: () => void }).close?.();
      await disconnectAllDbs();
    },
  };
};
