// 2026-09-29 使用者要求：上游補／改資料之後「精準回補」，不要每次都全部重新計算。輸入是上游給的變動清單
// （mops-ts 的補缺清單就是這個格式：TSV 表頭含 symbol / year / quarter，其他欄位忽略），只重算清單裡的公司，
// 而且只從「這家公司最早變動的那一季」往後算到目前最新一季——更早的季度讀不到新資料，不會變。
//
// 為什麼從變動季一路算到最新、而不是只算變動那一季：變動會往後傳——TTM 窗口（後 3 季）、YoY（後 4 季）、
// 平均餘額（後 4 季），以及連續獲利／配息年數、CAGR、5 年指標這類讀整段年度歷史的指標（例如補了 FY109，
// 115Q2 的 consecutiveProfitYears 就會從 4 變 5，2026-09-29 雲端首跑實測到）。
// ponytail: 每家公司從變動季到最新一季「全部指標」都重算，最壞是補很舊的一季 × 全部 label（今天 109Q4 → 23 季）。
// 要更省就在 backfillTaskDefinitions 替每個 label 宣告回看窗口（只看當季／4 季／8 季／整段歷史），短窗口的
// label 只算到變動季 + 窗口長度為止；分錯類會安靜少算，所以沒有實測對照前先不做。
//
// 用法：
//   CHANGES_FILE=C:/tmp/oingg-mops-q4gap-added-20260929.tsv pnpm tsx scripts/refreshChangedQuartersPit.ts
//   CHANGES='109Q4:1101,1102;112Q4:3716' pnpm tsx scripts/refreshChangedQuartersPit.ts
//     同一件事的精簡寫法，給雲端 Job 用（容器裡沒有檔案，用 gcloud run jobs execute --update-env-vars 傳；
//     環境變數單一值上限 32KB，大約夠 3,000 家——2026-09-29 那批 1,534 家約 8KB）
//   DRY_RUN=1 ...  只印要跑幾家、幾個 (公司, 季)，不寫入
// 重算核心在 ./quarterlyRefresh.ts（跟上游變動處理程式共用）：公司併發 8，同一家公司的各季在同一個 worker 內依序跑。
// 失敗的 (公司, 季) 寫成同格式的 tmp/refresh-changed-failures.tsv，可以直接當 CHANGES_FILE 餵回來重跑。

import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { disconnectAllDbs } from '../src/bootstrap/db';
import { memoizeStatementsForBackfill } from '../src/bootstrap/memoizedStatements';
import { quarterIndex } from '../src/domain/upstream/recomputeTargets';
import { refreshFromQuarters } from './quarterlyRefresh';

const keepEarliest = (earliest: Map<string, number>, symbol: string, year: number, season: number, source: string): void => {
  if (!symbol || !Number.isInteger(year) || !(season >= 1 && season <= 4)) throw new Error(`變動清單有無法解析的項目：${source}`);
  earliest.set(symbol, Math.min(earliest.get(symbol) ?? Infinity, quarterIndex(year, season)));
};

// CHANGES='109Q4:1101,1102;112Q4:3716' → 每家公司最早變動的季（index）。
const parseChangesEnv = (value: string): Map<string, number> => {
  const earliest = new Map<string, number>();
  for (const group of value.split(';').filter((g) => g.trim().length > 0)) {
    const [quarterToken = '', symbols = ''] = group.split(':');
    const match = /^(\d+)Q([1-4])$/.exec(quarterToken.trim());
    if (!match) throw new Error(`CHANGES 的季度要寫成「民國年Q季」，例如 109Q4：${group}`);
    for (const symbol of symbols.split(',').map((s) => s.trim()).filter(Boolean)) keepEarliest(earliest, symbol, Number(match[1]), Number(match[2]), group);
  }
  return earliest;
};

// 變動清單 → 每家公司最早變動的季（index）。
const readEarliestChangeBySymbol = (filePath: string): Map<string, number> => {
  const [header, ...lines] = readFileSync(filePath, 'utf8').split(/\r?\n/).filter((line) => line.trim().length > 0);
  const columns = header!.split('\t').map((c) => c.trim());
  const [iSymbol, iYear, iQuarter] = ['symbol', 'year', 'quarter'].map((name) => columns.indexOf(name));
  if (iSymbol! < 0 || iYear! < 0 || iQuarter! < 0) throw new Error(`CHANGES_FILE 表頭要有 symbol / year / quarter 三欄，實際是：${columns.join(', ')}`);
  const earliest = new Map<string, number>();
  for (const line of lines) {
    const cells = line.split('\t');
    keepEarliest(earliest, cells[iSymbol!]!.trim(), Number(cells[iYear!]), Number(cells[iQuarter!]), line);
  }
  return earliest;
};

const main = async () => {
  const filePath = process.env.CHANGES_FILE;
  const changes = process.env.CHANGES;
  if (!filePath === !changes) throw new Error('CHANGES_FILE（TSV，表頭含 symbol / year / quarter）跟 CHANGES（精簡寫法）二選一，必填。');
  const earliest = filePath ? readEarliestChangeBySymbol(filePath) : parseChangesEnv(changes!);

  const memo = memoizeStatementsForBackfill();
  const { failed } = await refreshFromQuarters(earliest, { logPrefix: '[refresh-changed]', memo, dryRun: process.env.DRY_RUN === '1' });
  if (failed.length > 0) {
    const dir = join(process.cwd(), 'tmp');
    mkdirSync(dir, { recursive: true });
    const out = join(dir, 'refresh-changed-failures.tsv');
    writeFileSync(out, ['symbol\tyear\tquarter\tlabel\tmessage', ...failed.map((f) => `${f.symbol}\t${f.year}\t${f.season}\t${f.label}\t${f.message.replace(/\s+/g, ' ')}`)].join('\n'));
    console.log(`[refresh-changed] ${failed.length} 筆失敗，清單 ${out}（可直接當 CHANGES_FILE 重跑）`);
    process.exitCode = 1;
  }
};

main()
  .catch((error) => {
    console.error('[refresh-changed] 執行失敗：', error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await disconnectAllDbs();
  });
