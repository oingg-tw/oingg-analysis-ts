import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';

// Phase 6-2 一次性 codemod：讓 scripts/*.ts 只 import src/bootstrap 與 src/domain（dependency-cruiser 的
// scripts-only-bootstrap / prisma-only-in-infrastructure 兩條規則歸零）：
//   - Prisma client import + `.finally` 裡逐一 $disconnect → bootstrap/db 的 disconnectAllDbs()
//   - metricDefinitionRegistry 改從 bootstrap/metricDefinitions 拿（跟 upsertMetricDefinition 合成一行）
//   - 內嵌的母體 raw SQL（依 SQL 文字比對的固定幾種形狀）→ bootstrap/scripts 的 backfillUniverse.*
//   - securitiesIndustry / dividendDistribution 的 repository import → backfillUniverse.*
// 殘留其他 Prisma 用法的檔案印成 MANUAL 清單，手動處理。用法：npx tsx scripts/codemods/scriptsToBootstrap.ts [--dry-run]

const SCRIPTS_DIR = 'scripts';
const dryRun = process.argv.includes('--dry-run');

const PRISMA_CLIENTS = ['analysisPrisma', 'mopsExportPrisma', 'twseExportPrisma', 'tpexExportPrisma', 'govExportPrisma', 'playwrightExportPrisma', 'sitcaExportPrisma', 'twseExportDevPrisma'];

// `${year}` → year、'115' → '115'
const arg = (raw: string): string => raw.replace(/^\$\{(.+)\}$/, '$1');

const manual: string[] = [];

for (const file of readdirSync(SCRIPTS_DIR).filter((f) => f.endsWith('.ts')).sort()) {
  const filePath = path.join(SCRIPTS_DIR, file);
  const original = readFileSync(filePath, 'utf8');
  let src = original;
  const needs = new Set<string>();

  // 1. raw SQL → backfillUniverse / analysisQueries（SQL 文字逐段比對，空白/縮排寬鬆）
  const rawQuery = (client: string, rowType: string, sql: string): RegExp =>
    new RegExp(`await ${client}\\.\\$queryRaw<${rowType}>\`\\s*${sql}\\s*\``, 'g');
  const S = String.raw;
  const replacements: [RegExp, (...m: string[]) => string, string][] = [
    [rawQuery('mopsExportPrisma', S`\{ symbol: string \}\[\]`, S`SELECT DISTINCT symbol FROM "export"\."quarterly_income_statement_xbrl"\s+WHERE year = (\S+) AND quarter = (\S+) AND data_type = '2'\s+ORDER BY symbol`), (_, y, q) => `await backfillUniverse.listSymbolsWithIncomeStatement(${arg(y)}, ${arg(q)})`, 'backfillUniverse'],
    [rawQuery('mopsExportPrisma', S`\{ symbol: string \}\[\]`, S`SELECT DISTINCT symbol FROM "export"\."bank_capital_adequacy_detail_xbrl" WHERE eligible_capital IS NOT NULL ORDER BY symbol`), () => 'await backfillUniverse.listBankSymbols()', 'backfillUniverse'],
    [rawQuery('mopsExportPrisma', S`\{ symbol: string \}\[\]`, S`SELECT DISTINCT symbol FROM "export"\."bank_capital_adequacy_detail_xbrl"\s+WHERE year = (\S+) AND quarter = (\S+) AND eligible_capital IS NOT NULL\s+ORDER BY symbol`), (_, y, q) => `await backfillUniverse.listBankSymbolsForQuarter(${arg(y)}, ${arg(q)})`, 'backfillUniverse'],
    [rawQuery('mopsExportPrisma', S`\{ symbol: string \}\[\]`, S`SELECT DISTINCT symbol FROM "export"\."bank_income_statement_detail_xbrl"\s+WHERE net_income_loss_of_interest_quarter IS NOT NULL\s+ORDER BY symbol`), () => 'await backfillUniverse.listSymbolsWithBankIncomeStatement()', 'backfillUniverse'],
    [rawQuery('twseExportPrisma', S`Array<\{ trade_date: Date \}>`, S`SELECT DISTINCT trade_date FROM "export"\."daily_price" WHERE symbol = \$\{symbol\} ORDER BY trade_date ASC`), () => 'await backfillUniverse.listDailyPriceTradeDates(symbol)', 'backfillUniverse'],
    [rawQuery('twseExportPrisma', S`Array<\{ trade_date: Date \}>`, S`SELECT DISTINCT trade_date FROM "export"\."daily_valuation" WHERE symbol = \$\{symbol\} ORDER BY trade_date ASC`), () => 'await backfillUniverse.listDailyValuationTradeDates(symbol)', 'backfillUniverse'],
    [rawQuery('govExportPrisma', S`\{ symbol: string \}\[\]`, S`SELECT DISTINCT symbol FROM "export"\."company_industry_classification" WHERE section_code = 'C' AND rank = 0 ORDER BY symbol`), () => 'await backfillUniverse.listManufacturingSymbols()', 'backfillUniverse'],
    [rawQuery('analysisPrisma', S`LatestMetricRow\[\]`, S`SELECT DISTINCT ON \(symbol\) symbol, value::float AS value, fiscal_year, fiscal_quarter, knowledge_date, knowledge_date_is_fallback\s+FROM metric_values\s+WHERE metric_code = \$\{metricCode\} AND period_type = 'TTM' AND data_type = '2' AND subsidiary_company_id = '' AND value IS NOT NULL\s+ORDER BY symbol, fiscal_year DESC, fiscal_quarter DESC, knowledge_date DESC`), () => 'await analysisQueries.listLatestTtmValuesAcrossMarket(metricCode)', 'analysisQueries'],
  ];
  for (const [re, build, need] of replacements) {
    if (re.test(src)) {
      src = src.replace(re, (...m: string[]) => build(...m));
      needs.add(need);
    }
  }

  // 2. repository 直接 import → backfillUniverse
  if (src.includes("from '../src/infrastructure/repositories/exchange/securitiesIndustry'")) {
    src = src.replace(/^import \{[^}]*\} from '\.\.\/src\/infrastructure\/repositories\/exchange\/securitiesIndustry';\r?\n/m, '');
    src = src.replace(/\blistCompaniesBySectorCodes\(/g, 'backfillUniverse.listCompaniesBySectorCodes(').replace(/\bisFinancialIndustryCompany\(/g, 'backfillUniverse.isFinancialIndustryCompany(');
    needs.add('backfillUniverse');
  }
  if (src.includes("from '../src/infrastructure/repositories/mops/dividendDistribution'")) {
    src = src.replace(/^import \{[^}]*\} from '\.\.\/src\/infrastructure\/repositories\/mops\/dividendDistribution';\r?\n/m, '');
    src = src.replace(/\bgetSymbolsWithDividendDistribution\(/g, 'backfillUniverse.listSymbolsWithDividendDistribution(');
    needs.add('backfillUniverse');
  }

  // 3. registry：跟 upsertMetricDefinition 合成一行 bootstrap/metricDefinitions 的 import
  if (src.includes("from '../src/application/metrics/metricDefinitionRegistry'")) {
    src = src.replace(/^import \{ metricDefinitionRegistry \} from '\.\.\/src\/application\/metrics\/metricDefinitionRegistry';\r?\n/m, '');
    if (src.includes("import { upsertMetricDefinition } from '../src/bootstrap/metricDefinitions';")) {
      src = src.replace("import { upsertMetricDefinition } from '../src/bootstrap/metricDefinitions';", "import { metricDefinitionRegistry, upsertMetricDefinition } from '../src/bootstrap/metricDefinitions';");
    } else {
      src = src.replace(/^(import [^\n]*\r?\n)/m, "$1import { metricDefinitionRegistry } from '../src/bootstrap/metricDefinitions';\n");
    }
  }

  // 4. Prisma client import + finally 裡的 $disconnect
  const clientImportRe = /^import (?:\{ \w+ \}|\w+) from '\.\.\/src\/infrastructure\/prisma\/\w+';\r?\n/gm;
  if (clientImportRe.test(src)) {
    src = src.replace(clientImportRe, '');
    src = src.replace(/\.finally\(async \(\) => \{\r?\n(?:[ \t]*await \w+\.\$disconnect\(\);\r?\n)+[ \t]*\}\)/g, '.finally(async () => {\n    await disconnectAllDbs();\n  })');
    if (!src.includes("from '../src/bootstrap/db'")) needs.add('disconnectAllDbs');
  }

  // 5. 補 import
  const extra: string[] = [];
  if (needs.has('backfillUniverse') || needs.has('analysisQueries')) {
    const names = ['backfillUniverse', 'analysisQueries'].filter((n) => needs.has(n));
    extra.push(`import { ${names.join(', ')} } from '../src/bootstrap/scripts';`);
  }
  if (needs.has('disconnectAllDbs')) extra.push("import { disconnectAllDbs } from '../src/bootstrap/db';");
  if (extra.length > 0) {
    const importBlock = src.match(/^(?:import[^\n]*\r?\n)+/m);
    if (!importBlock || importBlock.index === undefined) throw new Error(`${file}: 找不到 import 區塊`);
    const at = importBlock.index + importBlock[0].length;
    src = `${src.slice(0, at)}${extra.join('\n')}\n${src.slice(at)}`;
  }

  if (new RegExp(`\\b(${PRISMA_CLIENTS.join('|')})\\b`).test(src) || /from '\.\.\/src\/(application|infrastructure)/.test(src)) manual.push(file);

  if (src === original) continue;
  if (dryRun) {
    console.log(`--- ${file}\n${src.slice(0, 800)}\n...`);
    continue;
  }
  writeFileSync(filePath, src);
  console.log(`[ok] ${file}`);
}

if (manual.length > 0) console.log(`\nMANUAL（還殘留 Prisma / application / infrastructure 引用）：\n  ${manual.join('\n  ')}`);
