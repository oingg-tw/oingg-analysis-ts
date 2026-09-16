// 2026-09-11 使用者要求：全市場排行需要「每支指標的最新一筆值」（不是歷史多季，那是
// 給單一公司趨勢圖用的，跟排行是不同情境，先擱置）。這支腳本涵蓋除了 marketCap/pegRatio/
// ncav/grahamNumber（已經有專屬的 backfillMarketCapNcavGrahamNumberFullMarketPit.ts）以外
// 的全部指標，一般公司清單跟銀行清單分開跑（銀行專屬指標只在真正的銀行股才有意義）。
//
// 全市場清單跟 backfillMarketCapNcavGrahamNumberFullMarketPit.ts 同一個標準：115Q2
// dataType='2' 有 XBRL 合併報表資料的公司（2,058 家）。銀行清單改成動態查
// bank_capital_adequacy_detail_xbrl 的 eligible_capital IS NOT NULL（不是隨便一列都算，
// 這張表每家公司都有列，只是非銀行業的銀行專屬欄位是 null，見 mops-ts 2026-09-11 的
// 澄清），實測只有 11 家（1409/2801/2812/2834/2836/2838/2845/2849/2897/5863/5876）。
//
// 2026-09-11 第一版是完全序列（一家公司做完才做下一家、同一家公司內 61 支指標也依序
// await），實測 2058 家預估要 22.9 小時，使用者問「有無可改善的地方」——診斷後發現
// 完全沒有平行化，改成兩層平行：(1) 同一家公司內的 61 支指標大多互不依賴（各自獨立讀
// 同一季資料算出來），改用 Promise.allSettled 平行送出，任一支失敗不影響其他支；
// (2) 多家公司同時處理（SYMBOL_CONCURRENCY，見下方），用簡單的固定併發池，不是無上限
// Promise.all 全部公司一次送出（避免瞬間打爆 Neon DB 連線數）。使用者明確要求「以後
// 平行版本可以穩定，所以有問題就要停下來修」——先用小批次（PILOT_LIMIT 環境變數）驗證
// 錯誤率/連線穩定性（30/100 家實測都是 0 錯誤，速度從序列版 ~40s/symbol 降到
// ~4s/symbol），確認沒問題才跑全市場。
//
// 逐日型指標（beta/exchangePeRatio+exchangePbRatio+dividendYield）刻意只算「最新一筆」
// （不傳 date，函式自己解析最新可用交易日），不是像 2330 那樣逐一歷史交易日重算——
// 使用者確認排行只需要最新值，逐日全歷史回填成本高很多倍且非必要。
//
// 2026-09-11 使用者要求「有 error 的話希望有機制可以精準回補」——buildGeneralTasks/
// buildBankTasks/runTasks/BackfillFailure 抽到 scripts/backfillTaskDefinitions.ts
// （沒有 top-level 執行副作用的純模組），跟 scripts/retryBackfillFailuresPit.ts 共用
// 同一份指標清單；runBatch 完成後把失敗的 (symbol, label) 組合寫進
// tmp/backfill-failures-<slug>.json，retry 腳本讀這個檔案只重跑失敗的部分。
//
// 用法：pnpm tsx scripts/backfillAllMetricsLatestFullMarketPit.ts
//      PILOT_LIMIT=30 pnpm tsx scripts/backfillAllMetricsLatestFullMarketPit.ts（小批次測試）

import { mkdirSync, writeFileSync, existsSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { GENERAL_METRIC_CODES, BANK_METRIC_CODES, buildGeneralTasks, buildBankTasks, runTasks, type BackfillFailure } from './backfillTaskDefinitions';
import { metricDefinitionRegistry, upsertMetricDefinition } from '../src/bootstrap/metricDefinitions';
import { backfillUniverse } from '../src/bootstrap/scripts';
import { disconnectAllDbs } from '../src/bootstrap/db';

const PROGRESS_EVERY = 50;

const getFullMarketSymbols = async (): Promise<string[]> => {
  const rows = await backfillUniverse.listSymbolsWithIncomeStatement('115', '2');
  return rows.map((r) => r.symbol);
};

const getBankSymbols = async (): Promise<string[]> => {
  const rows = await backfillUniverse.listBankSymbols();
  return rows.map((r) => r.symbol);
};

type SymbolResult = { failures: { label: string; error: unknown }[]; outcomes: { label: string; outcome: unknown }[] };

const computeGeneralSymbol = (symbol: string): Promise<SymbolResult> => runTasks(buildGeneralTasks(symbol));

const computeBankSymbol = (symbol: string): Promise<SymbolResult> => runTasks(buildBankTasks(symbol));

// 2026-09-17 clean architecture 重構 Phase 3 的 exit proof：全市場重跑後每個 basis 的 action 統計——
// 遷移後的程式碼算出來的值如果跟 DB 一樣，寫入層會回 skipped_unchanged；updated_same_knowledge_date
// = 值變了、rejected = 座標/註冊出問題，兩者都是回歸訊號；inserted 只有「新交易日/新一季資料出現」
// 才合理（逐日型 label 每天都會，季報型只有上游有新季度時）。跟 scripts/verifyMetricEquivalencePit.ts
// 同一套遞迴收集法（outcome 形狀各家不同，遇到帶字串 action 的物件就收一筆）。
const REGRESSION_ACTIONS = new Set(['updated_same_knowledge_date', 'rejected']);

const collectActions = (value: unknown, out: string[]): void => {
  if (!value || typeof value !== 'object') return;
  const record = value as Record<string, unknown>;
  if (typeof record.action === 'string') {
    out.push(record.action);
    return;
  }
  for (const inner of Object.values(record)) collectActions(inner, out);
};

type ActionCounts = Record<string, number>;

const writeActionSummary = (slug: string, total: ActionCounts, byLabel: Record<string, ActionCounts>): void => {
  const dir = join(process.cwd(), 'tmp');
  mkdirSync(dir, { recursive: true });
  const filePath = join(dir, `full-market-actions-${slug}.json`);
  writeFileSync(filePath, JSON.stringify({ generatedAt: new Date().toISOString(), total, byLabel }, null, 2));
  const regressions = Object.entries(total).filter(([action]) => REGRESSION_ACTIONS.has(action));
  console.log(`[full-market-latest-pit] ${slug} action 統計：${JSON.stringify(total)}（明細 ${filePath}）`);
  if (regressions.length > 0) {
    console.error(`[full-market-latest-pit] ${slug} 出現回歸訊號：${JSON.stringify(Object.fromEntries(regressions))}——請對照 byLabel 找出是哪幾支指標`);
  }
};

// 固定併發池：同時處理 SYMBOL_CONCURRENCY 家公司，不是無上限一次送出全部——避免瞬間
// 打爆 Neon DB 連線數（見檔頭 2026-09-11 平行化改動的說明）。
const SYMBOL_CONCURRENCY = 8;

// 精準回補用——每筆失敗記錄 (symbol, label)，不是只記 symbol。使用者要求「有 error 的話
// 希望有機制可以精準回補」：失敗清單寫成 JSON（tmp/backfill-failures-<slug>.json，
// gitignore 排除，純執行期產物），scripts/retryBackfillFailuresPit.ts 讀這個檔案，
// 只重跑清單裡列出的那幾個 (symbol, label) 組合，不用重新跑整批 61 支指標。
const writeFailuresFile = (slug: string, failures: BackfillFailure[]): void => {
  const dir = join(process.cwd(), 'tmp');
  mkdirSync(dir, { recursive: true });
  const filePath = join(dir, `backfill-failures-${slug}.json`);
  if (failures.length === 0) {
    if (existsSync(filePath)) rmSync(filePath);
    return;
  }
  writeFileSync(filePath, JSON.stringify(failures, null, 2));
  console.log(`[full-market-latest-pit] 失敗清單已寫入 ${filePath}（${failures.length} 筆），可用 scripts/retryBackfillFailuresPit.ts 精準回補`);
};

const runBatch = async (
  label: string,
  slug: string,
  symbols: string[],
  fn: (symbol: string) => Promise<SymbolResult>
): Promise<void> => {
  console.log(`[full-market-latest-pit] ${label}：共 ${symbols.length} 家，併發數 ${SYMBOL_CONCURRENCY}`);
  const t0 = Date.now();
  let done = 0;
  const errors: BackfillFailure[] = [];
  const totalActions: ActionCounts = {};
  const actionsByLabel: Record<string, ActionCounts> = {};

  let cursor = 0;
  const worker = async (): Promise<void> => {
    while (cursor < symbols.length) {
      const symbol = symbols[cursor]!;
      cursor += 1;
      try {
        const { failures, outcomes } = await fn(symbol);
        for (const failure of failures) {
          const message = failure.error instanceof Error ? failure.error.message : String(failure.error);
          errors.push({ symbol, label: failure.label, message });
          console.error(`[full-market-latest-pit] ${label} ${symbol} ${failure.label} 失敗：`, failure.error);
        }
        for (const { label: taskLabel, outcome } of outcomes) {
          const actions: string[] = [];
          collectActions(outcome, actions);
          const perLabel = (actionsByLabel[taskLabel] ??= {});
          for (const action of actions) {
            totalActions[action] = (totalActions[action] ?? 0) + 1;
            perLabel[action] = (perLabel[action] ?? 0) + 1;
          }
        }
      } catch (error) {
        errors.push({ symbol, label: '(whole-symbol)', message: error instanceof Error ? error.message : String(error) });
        console.error(`[full-market-latest-pit] ${label} ${symbol} 失敗：`, error);
      }
      done += 1;

      if (done % PROGRESS_EVERY === 0 || done === symbols.length) {
        const elapsedMs = Date.now() - t0;
        const avgMsPerSymbol = elapsedMs / done;
        const remaining = symbols.length - done;
        const etaMs = avgMsPerSymbol * remaining;
        console.log(
          `[full-market-latest-pit] ${label} 進度 ${done}/${symbols.length}（${((done / symbols.length) * 100).toFixed(1)}%）` +
            ` 已耗時 ${(elapsedMs / 60000).toFixed(1)} 分鐘，預估剩餘 ${(etaMs / 60000).toFixed(1)} 分鐘，錯誤 ${errors.length} 筆`
        );
      }
    }
  };

  await Promise.all(Array.from({ length: Math.min(SYMBOL_CONCURRENCY, symbols.length) }, () => worker()));

  console.log(`[full-market-latest-pit] ${label} 完成，共 ${symbols.length} 家，錯誤 ${errors.length} 筆，總耗時 ${((Date.now() - t0) / 60000).toFixed(1)} 分鐘`);
  if (errors.length > 0) {
    console.log(`[full-market-latest-pit] ${label} 錯誤清單：`, [...new Set(errors.map((e) => e.symbol))].join(','));
  }
  writeFailuresFile(slug, errors);
  writeActionSummary(slug, totalActions, actionsByLabel);
};

const main = async () => {
  await Promise.all(GENERAL_METRIC_CODES.map((code) => upsertMetricDefinition(metricDefinitionRegistry[code]!)));
  await Promise.all(BANK_METRIC_CODES.map((code) => upsertMetricDefinition(metricDefinitionRegistry[code]!)));

  const [generalSymbolsFull, bankSymbolsFull] = await Promise.all([getFullMarketSymbols(), getBankSymbols()]);
  // PILOT_LIMIT：暫時性測試開關，驗證平行版本穩定後移除（見 2026-09-11 稳定性驗證要求）。
  const PILOT_LIMIT = process.env.PILOT_LIMIT ? Number(process.env.PILOT_LIMIT) : undefined;
  const generalSymbols = PILOT_LIMIT ? generalSymbolsFull.slice(0, PILOT_LIMIT) : generalSymbolsFull;
  const bankSymbols = PILOT_LIMIT ? bankSymbolsFull.slice(0, Math.min(PILOT_LIMIT, bankSymbolsFull.length)) : bankSymbolsFull;

  await runBatch('一般指標（含逐日型最新快照）', 'general', generalSymbols, computeGeneralSymbol);
  await runBatch('銀行監理指標', 'bank', bankSymbols, computeBankSymbol);
};

main()
  .catch((error) => {
    console.error('全市場最新一筆 backfill 腳本執行失敗：', error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await disconnectAllDbs();
  });
