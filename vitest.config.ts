import { defineConfig } from 'vitest/config';
import path from 'node:path';

// 這裡的別名解析刻意跟 tsconfig.json 的 paths 分開手動維護，不裝 vite-tsconfig-paths 這類外掛
// 自動同步——理由見 tsconfig.json 對 "#generated/*" 那段註解：那是 Node 原生 subpath import，
// 一律以最近的 package.json 為錨點解析，交給 tsx（dev/batch）跟 CommonJS build 處理沒問題，
// 但 vitest 底層是 Vite 的 resolver，不保證原生支援 package.json "imports" 欄位，這裡明確用
// alias 指向實際檔案，不去賭 Vite 有沒有支援，兩條路徑（tsc 型別檢查 vs vitest 執行期解析）
// 各自獨立維護，改動其中一邊要記得檢查另一邊還對不對。
export default defineConfig({
  test: {
    include: ['tests/**/*.test.ts'],
    // 這裡的測試絕大多數是打真的開發資料庫的整合測試（見 tests/README.md），不是隔離的單元測試，
    // 平行跑多支測試檔案可能同時打同一個 Postgres 連線池、甚至同一批資料列（例如
    // tests/domains/companies/metrics.test.ts 會刻意刪除+重算某些 symbol 的快取列）——
    // 关掉檔案間平行化，改成依序跑，避免测试互相踩到彼此正在操作的資料列。
    fileParallelism: false,
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html'],
      include: ['src/**/*.ts'],
    },
  },
  resolve: {
    alias: [
      { find: /^@\/(.*)$/, replacement: path.resolve(__dirname, 'src/$1') },
      { find: /^#generated\/(.*)$/, replacement: path.resolve(__dirname, 'generated/$1/index.js') },
    ],
  },
});
