import { Worker } from 'node:worker_threads';
import { config } from '@/infrastructure/config';
import { logger } from '@/infrastructure/logger';

// 2026-10-06 冷啟動優化 B（使用者拍板）：Cloud Run DEV 閒置後第一個請求約 17 秒，大頭是 Neon 從 autosuspend 喚醒＋冷快取（約 12 秒），
// 而 Prisma driver adapter 的 $connect 不真的開連線，喚醒全部落在第一個請求上。這裡在行程一開始、載入其餘模組之前，
// 開一條背景執行緒對每個 DB 送 SELECT 1，讓喚醒跟模組載入（雲端 1.7～5 秒）同時進行。
// 一定要用 worker：模組載入是同步的，主執行緒在那段時間不跑事件迴圈，連線（TLS、查詢）不會前進。
// pg 不是直接相依，透過 @prisma/adapter-pg 的位置載入它自己用的那份（不新增套件）。失敗只記 log，不影響啟動——
// 真正的連線仍由各 Prisma client 處理。
// ponytail: 只喚醒 compute，不預熱資料頁；第一批請求的冷快取（實測後兩個請求 6～7 秒）要靠 Neon 不休眠才省得掉。
const WORKER_SOURCE = `
const { workerData, parentPort } = require('node:worker_threads');
const { createRequire } = require('node:module');
const { Client } = createRequire(require.resolve('@prisma/adapter-pg'))('pg');
Promise.all(workerData.map(async ([label, connectionString]) => {
  const start = Date.now();
  const client = new Client({ connectionString });
  try {
    await client.connect();
    await client.query('SELECT 1');
    return [label, Date.now() - start, null];
  } catch (error) {
    return [label, Date.now() - start, String(error && error.message || error)];
  } finally {
    await client.end().catch(() => {});
  }
})).then((results) => parentPort.postMessage(results));
`;

export const wakeDatabases = (): void => {
  const targets: [string, string][] = [
    ['analysis', config.db.analysis],
    ['mops', config.db.mopsExport],
    ['gov', config.db.govExport],
    ['twse', config.db.twseExport],
    ['tpex', config.db.tpexExport],
    ['sitca', config.db.sitcaExport],
  ];
  const startedAt = process.uptime();
  try {
    const worker = new Worker(WORKER_SOURCE, { eval: true, workerData: targets });
    worker.unref();
    worker.on('message', (results: [string, number, string | null][]) => {
      for (const [label, ms, error] of results) logger.info(`[startup] wake ${label} ${ms}ms${error ? ` failed: ${error}` : ''}`);
      logger.info(`[startup] wake done at ${process.uptime().toFixed(3)}s (started at ${startedAt.toFixed(3)}s)`);
    });
    worker.on('error', (error) => logger.warn({ err: error }, '[startup] wake worker failed'));
  } catch (error) {
    logger.warn({ err: error }, '[startup] wake worker could not start');
  }
};
