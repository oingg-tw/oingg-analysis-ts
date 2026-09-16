// 2026-09-17 clean architecture 重構 Phase 0：用 dependency-cruiser 把目標分層的「依賴方向」
// 變成可執行的規則（計畫見 ~/.claude/plans/resilient-baking-quail.md 的 C2）。
//
// 目標分層：src/domain（純）→ src/application（use case + port）→ src/infrastructure（prisma/
// repositories/config/logger）→ src/http（express）→ src/bootstrap（composition root）。
// scripts/ 只能 import bootstrap + domain。
//
// 規則從第 0 天就是 error，但既有程式碼還沒搬家、必然大量違規——用 dependency-cruiser 內建的
// baseline 機制（`pnpm lint:deps:baseline` 產生 .dependency-cruiser-known-violations.json，
// `pnpm lint:deps` 用 --ignore-known 忽略已知違規）。紀律：baseline 只能縮小不能變大——搬家
// commit 讓它變大時要在同一個 commit 重產；每個 phase 收尾檢查 diff 只有刪除；Phase 6 歸零刪檔。
//
// 為什麼不用 oxlint 的 no-restricted-imports：沒有 baseline 機制、規則是「每個目錄一組 override」
// 很難表達 from/to 的組合、也抓不到 circular。oxlint 留一件這裡做不到的事：process.env 只准
// 在 config 讀（見 .oxlintrc.jsonc 的 no-restricted-properties）。
const layer = (name) => `^src/${name}/`;
const WEB_FRAMEWORK = 'node_modules/(ultimate-express|express|helmet|cors|pino-http|express-rate-limit|swagger-ui-express)/';
// 除了套件本身，也把「包著 PrismaClient 的 client 模組」算進去（今天在 src/adapters/prisma/，
// Phase 0.5 搬到 src/infrastructure/prisma/）——不然 models/api/domain 透過 analysisClient.ts
// 間接碰 Prisma 完全抓不到，規則會假綠。
const PRISMA = 'node_modules/@prisma/|^generated/|^#generated/|^src/(adapters|infrastructure)/prisma/';
const NEW_LAYERS_ABOVE_DOMAIN = '^src/(application|infrastructure|http|bootstrap)/';

/** @type {import('dependency-cruiser').IConfiguration} */
module.exports = {
  forbidden: [
    {
      name: 'no-circular',
      severity: 'error',
      comment: '循環依賴一律禁止（例如今天 adapters/swagger ↔ api 那種），Phase 1 起逐一拆掉。',
      from: {},
      to: { circular: true },
    },
    {
      name: 'domain-imports-nothing',
      severity: 'error',
      comment: 'domain 是最內層：不得依賴任何其他分層，也不得依賴任何套件（zod 例外，enum/schema 用）。',
      from: { path: layer('domain') },
      to: { path: `${NEW_LAYERS_ABOVE_DOMAIN}|node_modules/`, pathNot: 'node_modules/zod/' },
    },
    {
      name: 'application-only-domain',
      severity: 'error',
      comment: 'application（use case + port 介面）只能依賴 domain；DB/HTTP 細節透過 port 注入。',
      from: { path: layer('application') },
      to: { path: '^src/(infrastructure|http|bootstrap)/|node_modules/', pathNot: 'node_modules/zod/' },
    },
    {
      name: 'infrastructure-not-up',
      severity: 'error',
      comment: 'infrastructure 實作 application 的 port，不能反過來知道 http/bootstrap。',
      from: { path: layer('infrastructure') },
      to: { path: '^src/(http|bootstrap)/' },
    },
    {
      name: 'http-not-infrastructure',
      severity: 'error',
      comment: 'http 只碰 application/domain（連型別也不行——DTO/port 型別住 application），組裝是 bootstrap 的事。',
      from: { path: layer('http') },
      to: { path: '^src/(infrastructure|bootstrap)/' },
    },
    {
      name: 'scripts-only-bootstrap',
      severity: 'error',
      comment: 'scripts 只能透過 bootstrap 綁定好的 use case 跟 domain 型別工作，不能自己接 DB。',
      from: { path: '^scripts/' },
      to: { path: '^src/', pathNot: '^src/(bootstrap|domain)/' },
    },
    {
      name: 'web-framework-only-in-http',
      severity: 'error',
      comment: 'express/ultimate-express 跟它的 middleware 套件只准出現在 http 跟 bootstrap。',
      from: { path: '^src/', pathNot: '^src/(http|bootstrap)/' },
      to: { path: WEB_FRAMEWORK },
    },
    {
      name: 'prisma-only-in-infrastructure',
      severity: 'error',
      comment: 'Prisma client（含 generated/ 跟 #generated/* subpath）只准 infrastructure 碰；bootstrap 是 composition root，負責連線/斷線，例外。',
      from: { path: '^(src|scripts)/', pathNot: '^src/(infrastructure|bootstrap)/' },
      to: { path: PRISMA },
    },
    {
      name: 'dotenv-only-in-config',
      severity: 'error',
      comment: '.env 只在進場點（src/index.ts、bootstrap、scripts）跟 config 載入一次，不要散落在各 client。',
      from: { path: '^src/', pathNot: '^src/(index\\.ts$|infrastructure/config\\.ts$|bootstrap/)' },
      to: { path: 'node_modules/dotenv/' },
    },
    {
      name: 'unit-tests-no-io',
      severity: 'error',
      comment: 'tests/unit 只能靠 fakes：不得 import infrastructure/http/bootstrap 或 Prisma。',
      from: { path: '^tests/unit/' },
      to: { path: `^src/(infrastructure|http|bootstrap)/|${PRISMA}` },
    },
  ],
  options: {
    // 本專案用 typescript@7（tsgo），dependency-cruiser 18 還不支援它的 API（會直接 0 個模組被
    // 解析、假綠燈）——改用 swc 解析 .ts（@swc/core 在 devDependencies），swc 的 AST 同樣保留
    // `import type`，型別依賴一樣算數。
    parser: 'swc',
    tsConfig: { fileName: 'tsconfig.json' },
    // 連 `import type` 也算依賴——http-not-infrastructure 那條規則的重點就是型別也不能穿層。
    tsPreCompilationDeps: true,
    doNotFollow: { path: 'node_modules' },
    exclude: { path: '^(dist|generated|coverage|tmp|docs)/' },
    // baseline 檔（.dependency-cruiser-known-violations.json）不是 options 的欄位，由 CLI 的
    // --ignore-known 讀預設路徑（見 package.json 的 lint:deps / lint:deps:baseline）。
    cache: true,
    enhancedResolveOptions: {
      exportsFields: ['exports'],
      conditionNames: ['import', 'require', 'node', 'default'],
      mainFields: ['module', 'main', 'types'],
    },
    reporterOptions: {
      dot: { collapsePattern: '^src/[^/]+/[^/]+' },
    },
  },
};
