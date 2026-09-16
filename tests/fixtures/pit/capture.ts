import 'dotenv/config';
import { mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { pitDeps } from '../../../src/bootstrap/pitDeps';
import * as pit from '../../../src/bootstrap/pitMetrics';
import { disconnectAllDbs } from '../../../src/bootstrap/db';
import { createRecordingPorts } from '../../fakes/pit/cassette';

// 指標單元測試的 cassette 錄製器（`npx tsx tests/fixtures/pit/capture.ts [測試名...]`）——連真實 dev DB（唯讀，
// metricValues 換成記憶體版所以不寫入），對每支指標測試檔案掃出它呼叫的 compute + query 組合，用錄製版
// pitDeps 跑一遍，把每個 port 呼叫的（參數 → 回傳值）寫進 tests/fixtures/pit/<測試名>.json。
//
// 掃描規則（兩種寫法都認）：
//   舊：computeAndWriteXxxPit({ symbol: '2330', ... }) / computeAndWriteXxxPit(query)
//   新：replay.run(computeXxx)({ ... }) / replay.runNested(computeXxx, 'results')(query)
// 參數是識別字時，找檔案裡所有 `const <id> = { ... }` 的定義（同名不同 scope 的都收，多錄無害）。
// 每個 binding 對每個 query 都跑一次（超集，錄多不錄少），cassette 只會多不會缺。
//
// 什麼時候要重錄：測試新增了 compute/query 組合（回放時會直接丟「cassette 沒有錄到這個呼叫」）、
// 或上游資料重編後要更新釘住的真實數字（先確認新數字是對的，再重錄、再改斷言）。

const TEST_DIRS = ['tests/unit/application/metrics', 'tests/integration/application/metrics'];
const FIXTURE_DIR = path.resolve(__dirname);

// 凍結「現在」：有些 compute（beta 的查詢起點 = 現在減 5 年、dividendDistributionCount 的一年窗口…）用 new Date()
// 當 port 參數，錄製跟回放的時間不同 key 就對不上。錄製時把全域 Date 的無參數建構/Date.now 釘在同一個時刻，
// 寫進 cassette 的 recordedAt；回放端（tests/fakes/pit/replayHarness.ts）用 vitest 假時鐘設成同一個時刻。
const FROZEN_NOW = new Date();
const RealDate = Date;
class FrozenDate extends RealDate {
  constructor(...args: unknown[]) {
    // 無參數 → 凍結時刻；有參數（時間戳/字串/年月日…）原樣轉給 Date，型別上用 [number] 帶過 Date 的多載。
    super(...((args.length === 0 ? [FROZEN_NOW.getTime()] : args) as [number]));
  }
  static override now(): number {
    return FROZEN_NOW.getTime();
  }
}
globalThis.Date = FrozenDate as DateConstructor;

// 測試裡的 query 都是「字串值的扁平物件」（symbol/year/season/dataType/subsidiaryCompanyId），用 regex 解析就夠，
// 不用 eval。
const parseLiteral = (text: string): Record<string, string> => {
  const out: Record<string, string> = {};
  for (const m of text.matchAll(/(\w+):\s*'([^']*)'/g)) out[m[1]!] = m[2]!;
  return out;
};

const collectCalls = (source: string): { bindings: string[]; queries: unknown[] } => {
  const bindings = new Set<string>();
  const literals: string[] = [];
  const identifiers = new Set<string>();
  const callRe = /(?:computeAndWrite(\w+)Pit|replay\.run(?:Nested)?\(compute(\w+)(?:,\s*'[^']*')?\))\((\{[^{}]*\}|[A-Za-z_]\w*)\)/g;
  for (const m of source.matchAll(callRe)) {
    bindings.add(`computeAndWrite${m[1] ?? m[2]}Pit`);
    const arg = m[3]!;
    if (arg.startsWith('{')) literals.push(arg);
    else identifiers.add(arg);
  }
  for (const id of identifiers) {
    const defRe = new RegExp(`const ${id}(?::[^=\\n]+)? = (\\{[^{}]*\\});`, 'g');
    for (const m of source.matchAll(defRe)) literals.push(m[1]!);
  }
  const unique = new Map<string, unknown>();
  for (const literal of literals) {
    const parsed = parseLiteral(literal);
    unique.set(JSON.stringify(parsed), parsed);
  }
  return { bindings: [...bindings].sort(), queries: [...unique.values()] };
};

const listTestFiles = (): { name: string; file: string }[] => {
  const seen = new Map<string, string>();
  for (const dir of TEST_DIRS) {
    let files: string[] = [];
    try {
      files = readdirSync(dir).filter((f) => f.endsWith('Pit.test.ts'));
    } catch {
      continue;
    }
    for (const f of files) {
      const name = f.replace(/\.test\.ts$/, '');
      if (!seen.has(name)) seen.set(name, path.join(dir, f)); // unit 版優先（同名時）
    }
  }
  return [...seen.entries()].map(([name, file]) => ({ name, file }));
};

const main = async () => {
  const only = new Set(process.argv.slice(2));
  const original = { ...pitDeps };
  mkdirSync(FIXTURE_DIR, { recursive: true });

  for (const { name, file } of listTestFiles()) {
    if (only.size > 0 && !only.has(name)) continue;
    const { bindings, queries } = collectCalls(readFileSync(file, 'utf8'));
    if (bindings.length === 0) {
      console.log(`[skip] ${name}：檔案裡沒有 compute 呼叫`);
      continue;
    }

    const { ports, entries } = createRecordingPorts(original);
    Object.assign(pitDeps, ports);
    let calls = 0;
    for (const binding of bindings) {
      const run = (pit as unknown as Record<string, ((query: unknown) => Promise<unknown>) | undefined>)[binding];
      if (!run) throw new Error(`${name}: src/bootstrap/pitMetrics.ts 沒有 ${binding}`);
      for (const query of queries) {
        try {
          await run(query);
          calls++;
        } catch (error) {
          console.warn(`[warn] ${name}: ${binding}(${JSON.stringify(query)}) 丟錯，錄到的部分呼叫仍會保留：${(error as Error).message}`);
        }
      }
    }
    Object.assign(pitDeps, original);

    const sorted = Object.fromEntries(Object.keys(entries).sort().map((key) => [key, entries[key]]));
    const target = path.join(FIXTURE_DIR, `${name}.json`);
    writeFileSync(target, `${JSON.stringify({ recordedAt: FROZEN_NOW.toISOString(), entries: sorted }, null, 2)}\n`);
    console.log(`[ok] ${name}：${bindings.length} 個 compute × ${queries.length} 個 query（${calls} 次呼叫），錄到 ${Object.keys(sorted).length} 筆 → ${path.relative(process.cwd(), target)}`);
  }

  await disconnectAllDbs();
};

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
