// Flat config（ESLint 9+ 的新格式）。這個專案沒有裝 prettier——排版交給編輯器/開發者自己，
// 這裡只管「可能是真的 bug」的規則（未使用變數、浮空 Promise、any 濫用⋯⋯），不管排版風格。
import js from '@eslint/js';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  {
    ignores: ['dist/**', 'generated/**', 'node_modules/**', 'coverage/**'],
  },
  js.configs.recommended,
  ...tseslint.configs.recommendedTypeChecked,
  {
    languageOptions: {
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
    rules: {
      // 這個 codebase 到處都是 `bigint | null` 手動 pick 欄位、Decimal 轉換，non-null assertion（!）
      // 是既有慣例（例如 `ttmRecords[i]!`），關掉這條規則不是縱容濫用，是配合既有風格。
      '@typescript-eslint/no-non-null-assertion': 'off',
      // any 在少數地方是刻意用來繞過 Prisma 的動態 view 查詢型別，warn 不是 error，讓開發者自己判斷。
      '@typescript-eslint/no-explicit-any': 'warn',
      // 浮空 Promise 是這次要抓的重點——之前 industryCodes.ts 的背景重試就是刻意 `void`
      // 掉的，這條規則能抓到「忘記 await 或忘記標記 void」的真正遺漏。
      '@typescript-eslint/no-floating-promises': 'error',
      '@typescript-eslint/no-unused-vars': ['warn', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
    },
  },
  {
    files: ['tests/**/*.ts', 'scripts/**/*.ts'],
    rules: {
      // 測試/腳本裡常故意用寬鬆型別組測試資料，不用套用跟 src/ 一樣嚴格的 any 規則。
      '@typescript-eslint/no-explicit-any': 'off',
    },
  }
);
