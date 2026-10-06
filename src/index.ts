import 'dotenv/config'; // Load environment variables from .env file

const startTime = process.hrtime(); // Start timing before any other imports

// 2026-10-06 冷啟動優化：先開背景執行緒喚醒各 DB，再載入其餘模組（見 bootstrap/wakeDatabases.ts）。順序要在 server 之前。
import { wakeDatabases } from './bootstrap/wakeDatabases';
wakeDatabases();

import { startServer } from './bootstrap/server';

// 2026-09-17 clean architecture 重構：這支只剩「進場點」的職責——載 .env、記啟動時間、交給
// src/bootstrap/server.ts（連 DB → 載快取 → 組 app → listen）。Dockerfile 的 CMD 不用動。
void startServer({ startedAt: startTime });
