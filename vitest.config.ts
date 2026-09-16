import { defineConfig } from 'vitest/config';
import path from 'node:path';

// 這裡的別名解析刻意跟 tsconfig.json 的 paths 分開手動維護，不裝 vite-tsconfig-paths 這類外掛
// 自動同步——理由見 tsconfig.json 對 "#generated/*" 那段註解：那是 Node 原生 subpath import，
// 一律以最近的 package.json 為錨點解析，交給 tsx（dev/batch）跟 CommonJS build 處理沒問題，
// 但 vitest 底層是 Vite 的 resolver，不保證原生支援 package.json "imports" 欄位，這裡明確用
// alias 指向實際檔案，不去賭 Vite 有沒有支援，兩條路徑（tsc 型別檢查 vs vitest 執行期解析）
// 各自獨立維護，改動其中一邊要記得檢查另一邊還對不對。
//
// 2026-09-17 clean architecture 重構 Phase 0：拆成四個 project（見 tests/README.md）——
// - unit：純單元測試，不碰 DB，檔案間可平行；`pnpm test` 日常跑這個。
// - contract：對外契約守門（OpenAPI snapshot + HTTP golden），需要 .env 的 DB（唯讀）。
// - integration：打真實資料庫的整合測試；既有的 tests/{pitMetrics,models,domains,...} 舊資料夾
//   在 Phase 5 搬完之前都算在這個 project 裡。序列跑（見下方 fileParallelism 說明）。
// - flaky：隔離區，檔名 *.flaky.test.ts，retry 2 次，不算在 test:integration 裡。
export default defineConfig({
  test: {
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html'],
      include: ['src/**/*.ts'],
    },
    projects: [
      {
        extends: true,
        test: {
          name: 'unit',
          include: ['tests/unit/**/*.test.ts'],
          fileParallelism: true,
          // Phase 5 之前 tests/unit/ 還是空的，`pnpm test` 不能因此失敗；Phase 5 搬入單元測試後移除。
          passWithNoTests: true,
        },
      },
      {
        extends: true,
        test: {
          name: 'contract',
          include: ['tests/contract/**/*.test.ts'],
          setupFiles: ['tests/contract/setup.ts'],
          fileParallelism: false,
        },
      },
      {
        extends: true,
        test: {
          name: 'integration',
          include: ['tests/integration/**/*.test.ts', 'tests/{pitMetrics,models,domains,api,adapters,shared,twse}/**/*.test.ts'],
          exclude: ['**/*.flaky.test.ts', '**/node_modules/**'],
          setupFiles: ['tests/integration/setup.ts'],
          // 整合測試共用同一個 Postgres，有些會刪除+重算同一批資料列（例如
          // tests/domains/companies/metrics.test.ts）——關掉檔案間平行化依序跑，避免互相踩到。
          // Phase 5 測試改用唯一 symbol、且整合測試改打專用的 Neon branch 之後可以打開。
          fileParallelism: false,
        },
      },
      {
        extends: true,
        test: {
          name: 'flaky',
          include: ['tests/**/*.flaky.test.ts'],
          setupFiles: ['tests/integration/setup.ts'],
          fileParallelism: false,
          retry: 2,
        },
      },
    ],
  },
  resolve: {
    alias: [
      { find: /^@\/(.*)$/, replacement: path.resolve(__dirname, 'src/$1') },
      { find: /^#generated\/(.*)$/, replacement: path.resolve(__dirname, 'generated/$1/index.js') },
    ],
  },
});
