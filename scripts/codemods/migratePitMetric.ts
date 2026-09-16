// 2026-09-17 clean architecture 重構 Phase 3：把一支 compute*Pit.ts（算完直接寫入、預設參數注入
// financialDataAdapter）改寫成 computeXxx.ts（純計算、deps 注入、回傳 ComputationBatch），舊檔案位置
// 留 shim。配方見計畫 A5、範例見 profitability/roe/{computeRoe,computeRoePit}.ts（手動做的試點，
// 這支工具就是把那次的 diff 機械化）。
//
// 用法：
//   npx tsx scripts/codemods/migratePitMetric.ts --metric src/application/metrics/profitability/roa [--dry-run]
//   npx tsx scripts/codemods/migratePitMetric.ts --family src/application/metrics/profitability [--dry-run]
// 每個 metric 資料夾：compute*Pit.ts → git mv 成 compute*.ts 再改寫、寫回 shim；get*Provenance.ts /
// resolve*ProvenanceInputs.ts 加 deps 參數；provenanceResolvers.ts 的對應項改成綁 legacyPitDeps。
// 改寫是「純語法」的（ts-morph 只用來定位節點範圍，不做型別解析），每個檔案結束時會掃殘留的舊符號
// （statements/financialDataAdapter/writeMetricValue/@/infrastructure/…）印成 MANUAL 清單，剩下的手動收尾，
// 不追求 100% 自動——25 支非標準檔案本來就要人看（2026-09-17 盤點：70 支標準、25 支非標準）。
//
// 不變式：同一個 metric 資料夾只跑一次（shim 存在就跳過）；--dry-run 只印摘要不動檔案、不 git mv。

import { execFileSync } from 'node:child_process';
import { existsSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { basename, join, relative } from 'node:path';
import { Node, Project, QuoteKind, SyntaxKind, type ArrowFunction, type CallExpression, type SourceFile, type Statement } from 'ts-morph';

interface TextEdit {
  start: number;
  end: number;
  text: string;
}

const applyEdits = (text: string, edits: TextEdit[]): string => {
  const sorted = [...edits].sort((a, b) => b.start - a.start || b.end - a.end);
  let out = text;
  let lastStart = Number.POSITIVE_INFINITY;
  for (const edit of sorted) {
    if (edit.end > lastStart) throw new Error(`codemod 內部錯誤：重疊的編輯 ${edit.start}-${edit.end}`);
    out = out.slice(0, edit.start) + edit.text + out.slice(edit.end);
    lastStart = edit.start;
  }
  return out;
};

const parse = (text: string): SourceFile => {
  const project = new Project({ useInMemoryFileSystem: true, skipFileDependencyResolution: true, manipulationSettings: { quoteKind: QuoteKind.Single } });
  return project.createSourceFile('virtual.ts', text, { overwrite: true });
};

// 產出的換行跟原檔一致（Windows 工作目錄多半是 CRLF），避免同一個檔案混用兩種換行。
const matchEol = (original: string, text: string): string => (original.includes('\r\n') ? text.replace(/\r?\n/g, '\r\n') : text);

// 「緊貼」在節點前面的註解區塊起點（中間沒有空白行）——避免把檔頭大段說明誤當成某個宣告的註解一起搬走。
const adjacentLeadingStart = (text: string, node: Node): number => {
  let start = node.getStart();
  const ranges = node.getLeadingCommentRanges();
  for (let i = ranges.length - 1; i >= 0; i -= 1) {
    const range = ranges[i]!;
    const gap = text.slice(range.getEnd(), start);
    if (/\r?\n[ \t]*\r?\n/.test(gap)) break;
    start = range.getPos();
  }
  return start;
};

// 整段移除一個宣告時連它後面的一個換行一起吃掉，不要留下連續兩行空白。
const endWithTrailingNewline = (text: string, node: Node): number => {
  const match = /^\r?\n/.exec(text.slice(node.getEnd()));
  return node.getEnd() + (match ? match[0].length : 0);
};

// 呼叫式最後一個引數之後的位置（多行引數時補在同一行，不是塞到右括號前面獨立成一行）。
const afterLastArg = (call: CallExpression): number => {
  const args = call.getArguments();
  return args.length > 0 ? args[args.length - 1]!.getEnd() : call.getEnd() - 1;
};

// ---- 識別字對照表：舊架構直接 import 的具體查詢 → deps 上的 port 方法 ----
type DepsKey = 'statements' | 'quarters' | 'announcements' | 'shares' | 'market' | 'xbrlAccounts' | 'industry' | 'dividendEvents';

const DEPS_KEY_ORDER: DepsKey[] = ['statements', 'quarters', 'announcements', 'shares', 'market', 'xbrlAccounts', 'industry', 'dividendEvents'];

// statements.getX（透過 adapter 物件呼叫）→ deps.<key>.getX
const ADAPTER_METHOD_TO_DEPS: Record<string, { key: DepsKey; method: string }> = {
  getIncomeStatement: { key: 'statements', method: 'getIncomeStatement' },
  getBalanceSheet: { key: 'statements', method: 'getBalanceSheet' },
  getCashFlowStatement: { key: 'statements', method: 'getCashFlowStatement' },
  getInsuranceIncomeStatement: { key: 'statements', method: 'getInsuranceIncomeStatement' },
  getPaidInShares: { key: 'shares', method: 'getPaidInShares' },
  getStockPrice: { key: 'market', method: 'getStockPrice' },
  getMarketCap: { key: 'market', method: 'getMarketCap' },
};

// 直接 import 的具體函式 → deps.<key>.method；latestQuarter 系列另外處理（要多塞一個 source 參數）。
const DIRECT_FUNCTION_TO_DEPS: Record<string, { key: DepsKey; method: string }> = {
  getIncomeStatementXbrlFirst: { key: 'statements', method: 'getIncomeStatement' },
  getBalanceSheetXbrlFirst: { key: 'statements', method: 'getBalanceSheet' },
  getCashFlowStatementXbrlFirst: { key: 'statements', method: 'getCashFlowStatement' },
  getInsuranceIncomeStatementXbrlFirst: { key: 'statements', method: 'getInsuranceIncomeStatement' },
  getBankAssetQualityTotalLoans: { key: 'statements', method: 'getBankAssetQuality' },
  getBankCapitalAdequacy: { key: 'statements', method: 'getBankCapitalAdequacy' },
  getBankIncomeStatementQuarter: { key: 'statements', method: 'getBankIncomeStatement' },
  getPaidInSharesAsOf: { key: 'shares', method: 'getPaidInShares' },
  getStockPriceAsOf: { key: 'market', method: 'getStockPrice' },
  getMarketCapAsOf: { key: 'market', method: 'getMarketCap' },
  getDailyValuationAsOf: { key: 'market', method: 'getDailyValuation' },
  getLatestDailyPrice: { key: 'market', method: 'getLatestDailyPrice' },
  listDailyClosesSince: { key: 'market', method: 'listDailyClosesSince' },
  listTaiexClosesSince: { key: 'market', method: 'listTaiexClosesSince' },
  getEarliestTradeDate: { key: 'market', method: 'getEarliestTradeDate' },
  getXbrlCashFlowQuarterly: { key: 'xbrlAccounts', method: 'getCashFlowAccounts' },
  getResearchAndDevelopmentExpense: { key: 'xbrlAccounts', method: 'getResearchAndDevelopmentExpense' },
  isFinancialIndustryCompany: { key: 'industry', method: 'isFinancialIndustryCompany' },
  isSoftwareOrCloudIndustryCompany: { key: 'industry', method: 'isSoftwareOrCloudIndustryCompany' },
  getCompanySectionCode: { key: 'industry', method: 'getCompanySectionCode' },
  getDividendDistributionEvents: { key: 'dividendEvents', method: 'getDividendDistributionEvents' },
};

const LATEST_QUARTER_FUNCTION_TO_SOURCE: Record<string, string> = {
  getLatestQuarterWithBalanceSheetXbrl: 'balanceSheet',
  getLatestQuarterWithIncomeStatementXbrl: 'incomeStatement',
  getLatestQuarterWithXbrlCashFlowQuarterly: 'cashFlowStatement',
  getLatestQuarterWithInsuranceIncomeStatement: 'insuranceIncomeStatement',
  getLatestQuarterWithBankAssetQuality: 'bankAssetQuality',
  getLatestQuarterWithBankCapitalAdequacy: 'bankCapitalAdequacy',
  getLatestQuarterWithBankIncomeStatement: 'bankIncomeStatement',
};

// infrastructure 的型別 import → application/ports 的同名（或改名）型別
const INFRA_TYPE_TO_PORT_MODULE: Record<string, string> = {
  IncomeStatementFields: '@/application/ports/financialStatements',
  BalanceSheetFields: '@/application/ports/financialStatements',
  CashFlowFields: '@/application/ports/financialStatements',
  InsuranceIncomeStatementFields: '@/application/ports/financialStatements',
  PaidInSharesAsOf: '@/application/ports/capitalStock',
  StockPriceAsOf: '@/application/ports/marketData',
  MarketCapAsOf: '@/application/ports/marketData',
  DailyValuationAsOf: '@/application/ports/marketData',
  DailyPriceAsOf: '@/application/ports/marketData',
  DividendDistributionEvent: '@/application/ports/dividendEvents',
  XbrlCashFlowQuarterlyRow: '@/application/ports/xbrlAccounts',
  BankAssetQualityRow: '@/application/ports/financialStatements',
  BankCapitalAdequacyRow: '@/application/ports/financialStatements',
  BankIncomeStatementQuarterRow: '@/application/ports/financialStatements',
};
const INFRA_TYPE_RENAME: Record<string, string> = {
  XbrlCashFlowQuarterlyRow: 'XbrlCashFlowAccounts',
  BankAssetQualityRow: 'BankAssetQualityFields',
  BankCapitalAdequacyRow: 'BankCapitalAdequacyFields',
  BankIncomeStatementQuarterRow: 'BankIncomeStatementFields',
};

const PORT_TYPE_TO_DEPS_KEY: Record<string, DepsKey> = {
  IncomeStatementPort: 'statements',
  BalanceSheetPort: 'statements',
  CashFlowStatementPort: 'statements',
  InsuranceIncomeStatementPort: 'statements',
  PaidInSharesPort: 'shares',
  StockPricePort: 'market',
  MarketCapPort: 'market',
};

const CONTEXT_KEYS = new Set(['symbol', 'rocYear', 'season', 'tradeDate']);
const WRITER_GROUP_HELPERS = ['periodTypeGroup', 'rollingWindowGroup', 'snapshotCadenceGroup'];

const isImportContext = (node: Node): boolean => Node.isImportSpecifier(node) || Node.isImportClause(node) || Node.isExportSpecifier(node);

// ---- 回傳物件字面值 → ComputationBatch 字面值 ----
interface LiteralRewrite {
  text: string;
  slotKeys: string[];
  usesNoQuarterBatch: boolean;
  isDaily: boolean;
}

const rewriteOutcomeLiteral = (source: string, expr: Node, manual: string[]): LiteralRewrite | null => {
  if (!Node.isObjectLiteralExpression(expr)) return null;
  const context: string[] = [];
  const slots: { key: string; valueText: string; full: string }[] = [];
  for (const prop of expr.getProperties()) {
    if (Node.isShorthandPropertyAssignment(prop)) {
      const key = prop.getName();
      if (CONTEXT_KEYS.has(key)) context.push(key);
      else slots.push({ key, valueText: key, full: key });
    } else if (Node.isPropertyAssignment(prop)) {
      const key = prop.getName();
      if (CONTEXT_KEYS.has(key)) context.push(prop.getText());
      else slots.push({ key, valueText: prop.getInitializer()?.getText() ?? '', full: prop.getText() });
    } else {
      manual.push(`物件字面值含 spread 或其他形式，要手動改成 slots：${source.slice(expr.getStart(), expr.getStart() + 80)}`);
      return null;
    }
  }
  if (slots.length === 0) {
    manual.push(`物件字面值沒有 basis 欄位：${expr.getText().slice(0, 80)}`);
    return null;
  }
  const isDaily = context.some((c) => c.startsWith('tradeDate'));
  const symbolProp = expr.getProperty('symbol');
  const symbolText = symbolProp && Node.isPropertyAssignment(symbolProp) ? (symbolProp.getInitializer()?.getText() ?? 'symbol') : 'symbol';
  const allNoQuarter = slots.every((s) => /^\{\s*action:\s*'skipped_no_quarter'\s*\}$/.test(s.valueText));
  const coordsNull = context.some((c) => /^rocYear:\s*null$/.test(c)) && context.some((c) => /^season:\s*null$/.test(c));
  if (allNoQuarter && coordsNull && !isDaily) {
    return { text: `noQuarterBatch(${symbolText}, [${slots.map((s) => `'${s.key}'`).join(', ')}])`, slotKeys: slots.map((s) => s.key), usesNoQuarterBatch: true, isDaily };
  }
  const slotsText = slots.map((s) => (s.valueText === s.key ? s.key : s.full)).join(', ');
  return { text: `{ ${context.join(', ')}, slots: { ${slotsText} } }`, slotKeys: slots.map((s) => s.key), usesNoQuarterBatch: false, isDaily };
};

// compute 函式自己的 return（不含巢狀函式/箭頭函式裡的 return）
const collectOwnReturns = (fn: ArrowFunction) =>
  fn.getDescendantsOfKind(SyntaxKind.ReturnStatement).filter((ret) => {
    let node: Node | undefined = ret.getParent();
    while (node && node !== fn) {
      if (Node.isArrowFunction(node) || Node.isFunctionExpression(node) || Node.isFunctionDeclaration(node)) return false;
      node = node.getParent();
    }
    return true;
  });

interface ComputeRewrite {
  text: string;
  shimExtras: string[];
  manual: string[];
  depsKeys: DepsKey[];
  slotKeys: string[];
  computeName: string;
  depsTypeName: string;
}

// ---- 主要改寫：compute*Pit.ts → compute*.ts ----
const rewriteCompute = (original: string): ComputeRewrite => {
  const manual: string[] = [];
  const depsKeys = new Set<DepsKey>();
  const computationImports = new Set<string>();
  let slotKeys: string[] = [];
  let isDaily = false;
  const shimExtras: string[] = [];
  let text = original;

  const oldName = /export const (computeAndWrite\w+)\b/.exec(original)?.[1];
  if (!oldName) throw new Error('找不到 export const computeAndWrite*');
  const computeName = `compute${oldName.slice('computeAndWrite'.length).replace(/Pit$/, '')}`;
  const stem = computeName.slice('compute'.length);
  const batchTypeName = `${stem}ComputationBatch`;
  const depsTypeName = `${stem}Deps`;
  const depsParamFunctions = new Set<string>(); // 檔內拿到 deps 參數的箭頭函式名稱
  const paramCounts = new Map<string, number>(); // 加 deps 之前的參數個數

  // 階段 1：`statements` 參數 → deps；沒有 statements 參數的 compute 也補 deps；函式改名；outcome 型別搬到 shim。
  {
    const sf = parse(text);
    const edits: TextEdit[] = [];
    for (const decl of sf.getVariableDeclarations()) {
      const arrow = decl.getInitializerIfKind(SyntaxKind.ArrowFunction);
      if (!arrow) continue;
      const params = arrow.getParameters();
      const statementsParam = params.find((p) => p.getName() === 'statements');
      if (statementsParam) {
        const typeText = statementsParam.getTypeNode()?.getText() ?? '';
        for (const portType of typeText.split('&').map((s) => s.trim()).filter(Boolean)) {
          const key = PORT_TYPE_TO_DEPS_KEY[portType];
          if (key) depsKeys.add(key);
          else manual.push(`未知的 port 型別 '${portType}'（${decl.getName()} 的 statements 參數）`);
        }
        edits.push({ start: statementsParam.getStart(), end: statementsParam.getEnd(), text: `deps: ${depsTypeName}` });
        depsParamFunctions.add(decl.getName());
        paramCounts.set(decl.getName(), params.length - 1);
      } else if (decl.getName() === oldName && params.length > 0) {
        const last = params[params.length - 1]!;
        edits.push({ start: last.getEnd(), end: last.getEnd(), text: `, deps: ${depsTypeName}` });
        depsParamFunctions.add(oldName);
        paramCounts.set(oldName, params.length);
      }
    }
    for (const id of sf.getDescendantsOfKind(SyntaxKind.Identifier)) {
      if (id.getText() === oldName) edits.push({ start: id.getStart(), end: id.getEnd(), text: computeName });
    }

    const computeDecl = sf.getVariableDeclaration(oldName)!;
    const arrow = computeDecl.getInitializerIfKind(SyntaxKind.ArrowFunction)!;
    const returnTypeNode = arrow.getReturnTypeNode();
    let outcomeTypeName: string | null = null;
    if (returnTypeNode) {
      const match = /^Promise<(\w+)>$/.exec(returnTypeNode.getText());
      if (match) {
        outcomeTypeName = match[1]!;
        edits.push({ start: returnTypeNode.getStart(), end: returnTypeNode.getEnd(), text: `Promise<${batchTypeName}>` });
      } else manual.push(`回傳型別不是 Promise<XxxPitOutcome> 的形狀：${returnTypeNode.getText()}`);
    } else manual.push('compute 函式沒有回傳型別註記');

    if (outcomeTypeName) {
      const declNode: Statement | undefined = sf.getTypeAlias(outcomeTypeName) ?? sf.getInterface(outcomeTypeName);
      if (declNode) {
        // interface 連緊貼的註解一起搬（通常在說明欄位形狀）；type alias 只搬宣告本身——它前面的註解
        // 幾乎都是在講 compute 函式（alias 習慣緊貼在 compute 前面），留在新檔案。
        const start = Node.isInterfaceDeclaration(declNode) ? adjacentLeadingStart(text, declNode) : declNode.getStart();
        shimExtras.push(text.slice(start, declNode.getEnd()));
        if (Node.isInterfaceDeclaration(declNode)) {
          slotKeys = declNode.getProperties().map((p) => p.getName()).filter((name) => !CONTEXT_KEYS.has(name));
          isDaily = declNode.getProperties().some((p) => p.getName() === 'tradeDate');
        }
        edits.push({ start, end: endWithTrailingNewline(text, declNode), text: '' });
        // 其他用到這個 outcome 型別的地方（hoisted 的 skippedNoQuarter 常數等）改指 batch 型別，初始值一併轉。
        for (const id of sf.getDescendantsOfKind(SyntaxKind.Identifier)) {
          if (id.getText() !== outcomeTypeName) continue;
          if (id.getStart() >= start && id.getEnd() <= declNode.getEnd()) continue; // 宣告本身（整段搬走）
          if (returnTypeNode && id.getStart() >= returnTypeNode.getStart() && id.getEnd() <= returnTypeNode.getEnd()) continue; // 回傳型別整個節點已另外改寫
          edits.push({ start: id.getStart(), end: id.getEnd(), text: batchTypeName });
        }
      } else manual.push(`找不到 ${outcomeTypeName} 的宣告（可能定義在別的檔案），shim 的型別要手動處理`);
    }

    const computeStmt = computeDecl.getVariableStatement()!;
    const insertAt = adjacentLeadingStart(text, computeStmt);
    edits.push({ start: insertAt, end: insertAt, text: `export type ${depsTypeName} = Pick<PitDeps, __DEPS_KEYS__>;\n\nexport type ${batchTypeName} = __BATCH_TYPE__<__SLOT_KEYS__>;\n\n` });
    text = applyEdits(text, edits);
  }

  // 階段 2：函式本體——statements.getX → deps.<key>.getX、裸 statements → deps、直接 import 的具體函式 → deps 方法、
  // resolveQuarterOrLatest/getLatestAvailableQuarter/resolveKnowledgeDate 補 port 參數。
  {
    const sf = parse(text);
    const edits: TextEdit[] = [];
    const directImportAliases = new Map<string, string>();
    for (const imp of sf.getImportDeclarations()) {
      if (!imp.getModuleSpecifierValue().startsWith('@/infrastructure/')) continue;
      for (const named of imp.getNamedImports()) {
        const originalName = named.getName();
        const local = named.getAliasNode()?.getText() ?? originalName;
        if (DIRECT_FUNCTION_TO_DEPS[originalName] || LATEST_QUARTER_FUNCTION_TO_SOURCE[originalName]) directImportAliases.set(local, originalName);
      }
    }

    for (const id of sf.getDescendantsOfKind(SyntaxKind.Identifier)) {
      const name = id.getText();
      const parent = id.getParent();
      if (!parent || isImportContext(parent) || Node.isParameterDeclaration(parent)) continue;

      if (name === 'statements') {
        if (Node.isPropertyAccessExpression(parent) && parent.getExpression() === id) {
          const method = parent.getName();
          const mapped = ADAPTER_METHOD_TO_DEPS[method];
          if (mapped) {
            depsKeys.add(mapped.key);
            edits.push({ start: parent.getStart(), end: parent.getEnd(), text: `deps.${mapped.key}.${mapped.method}` });
          } else manual.push(`statements.${method} 沒有對應的 deps 方法`);
        } else if (Node.isPropertyAssignment(parent) || Node.isShorthandPropertyAssignment(parent) || (Node.isPropertyAccessExpression(parent) && parent.getNameNode() === id)) {
          // 物件屬性名 / 別人的屬性，不是我們的參數
        } else edits.push({ start: id.getStart(), end: id.getEnd(), text: 'deps' });
        continue;
      }

      const originalName = directImportAliases.get(name);
      if (originalName) {
        if (Node.isCallExpression(parent) && parent.getExpression() === id) {
          const direct = DIRECT_FUNCTION_TO_DEPS[originalName];
          if (direct) {
            depsKeys.add(direct.key);
            edits.push({ start: id.getStart(), end: id.getEnd(), text: `deps.${direct.key}.${direct.method}` });
          } else {
            const source = LATEST_QUARTER_FUNCTION_TO_SOURCE[originalName]!;
            depsKeys.add('quarters');
            const args = parent.getArguments();
            const argsText = args.length > 0 ? text.slice(args[0]!.getStart(), args[args.length - 1]!.getEnd()) : '';
            edits.push({ start: parent.getStart(), end: parent.getEnd(), text: `deps.quarters.latestQuarterWith('${source}', ${argsText})` });
          }
        } else manual.push(`直接 import 的 ${name} 以非呼叫的形式被使用（例如當值傳遞），要手動改`);
        continue;
      }

      if (Node.isCallExpression(parent) && parent.getExpression() === id) {
        const argCount = parent.getArguments().length;
        const insertAt = afterLastArg(parent);
        if ((name === 'resolveQuarterOrLatest' && argCount === 2) || (name === 'getLatestAvailableQuarter' && argCount === 4)) {
          depsKeys.add('quarters');
          edits.push({ start: insertAt, end: insertAt, text: ', deps.quarters' });
        } else if (name === 'resolveKnowledgeDate' && argCount === 2) {
          depsKeys.add('announcements');
          edits.push({ start: insertAt, end: insertAt, text: ', deps.announcements' });
        }
      }
    }
    text = applyEdits(text, edits);
  }

  // 階段 2.5：檔內有用到 deps. 但沒有 deps 參數的頂層箭頭函式補參數；呼叫這些函式的地方補 deps 引數。
  {
    const sf = parse(text);
    const edits: TextEdit[] = [];
    for (const decl of sf.getVariableDeclarations()) {
      const arrow = decl.getInitializerIfKind(SyntaxKind.ArrowFunction);
      if (!arrow || !decl.getVariableStatement()) continue;
      const params = arrow.getParameters();
      if (params.some((p) => p.getName() === 'deps')) continue;
      if (!/\bdeps\./.test(arrow.getBody().getText())) continue;
      if (params.length === 0) {
        manual.push(`${decl.getName()} 用到 deps 但沒有參數可接，要手動加`);
        continue;
      }
      const last = params[params.length - 1]!;
      edits.push({ start: last.getEnd(), end: last.getEnd(), text: `, deps: ${depsTypeName}` });
      depsParamFunctions.add(decl.getName());
      paramCounts.set(decl.getName(), params.length);
    }
    text = applyEdits(text, edits);

    const sf2 = parse(text);
    const edits2: TextEdit[] = [];
    for (const call of sf2.getDescendantsOfKind(SyntaxKind.CallExpression)) {
      const callee = call.getExpression();
      if (!Node.isIdentifier(callee)) continue;
      const fnName = callee.getText();
      if (!depsParamFunctions.has(fnName) || fnName === computeName) continue;
      const args = call.getArguments();
      const expected = paramCounts.get(fnName) ?? 0;
      if (args.length === expected && args[args.length - 1]?.getText() !== 'deps') {
        edits2.push({ start: afterLastArg(call), end: afterLastArg(call), text: ', deps' });
      }
    }
    text = applyEdits(text, edits2);
  }

  // 階段 3：寫入呼叫 → 純 slot；回傳/hoisted 物件 → ComputationBatch；型別 BasisOutcome → ComputationSlot。
  {
    const sf = parse(text);
    const edits: TextEdit[] = [];
    for (const awaitExpr of sf.getDescendantsOfKind(SyntaxKind.AwaitExpression)) {
      const call = awaitExpr.getExpression();
      if (!Node.isCallExpression(call)) continue;
      const callee = call.getExpression().getText();
      if (callee !== 'writeOrSkip' && callee !== 'writeMetricValue') continue;
      const args = call.getArguments();
      const argsText = args.length > 0 ? text.slice(args[0]!.getStart(), args[args.length - 1]!.getEnd()) : '';
      const helper = callee === 'writeOrSkip' ? 'periodSlot' : 'computation';
      computationImports.add(helper);
      edits.push({ start: awaitExpr.getStart(), end: awaitExpr.getEnd(), text: `${helper}(${argsText})` });
    }

    const localBasisAlias = sf.getTypeAlias('BasisOutcome');
    if (localBasisAlias) {
      // beta 這類逐日型檔案自己宣告 `type BasisOutcome = MetricValueWriteOutcome | { action: 'skipped_no_trade_date' }`
      // ——ComputationSlot 已經涵蓋，整個別名刪掉。
      const start = adjacentLeadingStart(text, localBasisAlias);
      edits.push({ start, end: endWithTrailingNewline(text, localBasisAlias), text: '' });
    }
    for (const id of sf.getDescendantsOfKind(SyntaxKind.Identifier)) {
      if (id.getText() !== 'BasisOutcome') continue;
      const parent = id.getParent();
      if (!parent || isImportContext(parent) || (localBasisAlias && id.getStart() >= localBasisAlias.getStart() && id.getEnd() <= localBasisAlias.getEnd())) continue;
      computationImports.add('type ComputationSlot');
      edits.push({ start: id.getStart(), end: id.getEnd(), text: 'ComputationSlot' });
    }

    const computeDecl = sf.getVariableDeclaration(computeName);
    const arrow = computeDecl?.getInitializerIfKind(SyntaxKind.ArrowFunction);
    const literalTargets: Node[] = [];
    if (arrow) {
      for (const ret of collectOwnReturns(arrow)) {
        const expr = ret.getExpression();
        if (expr && Node.isObjectLiteralExpression(expr)) literalTargets.push(expr);
        else if (expr && Node.isIdentifier(expr)) {
          // return skippedNoQuarter 之類——hoisted 常數在下面處理
        } else manual.push(`return 不是物件字面值：${ret.getText().slice(0, 80)}`);
      }
    }
    // hoisted 常數：型別註記已在階段 1 改成 XxxComputationBatch 的變數（多半在 compute 函式內部，
    // 所以要走 descendants 不能只看頂層），初始值是物件字面值
    for (const decl of sf.getDescendantsOfKind(SyntaxKind.VariableDeclaration)) {
      if (decl.getTypeNode()?.getText() !== batchTypeName) continue;
      const init = decl.getInitializer();
      if (init && Node.isObjectLiteralExpression(init)) literalTargets.push(init);
      else manual.push(`${decl.getName()} 的型別是 outcome 但初始值不是物件字面值，要手動改`);
    }
    for (const target of literalTargets) {
      const rewritten = rewriteOutcomeLiteral(text, target, manual);
      if (!rewritten) continue;
      if (slotKeys.length === 0) slotKeys = rewritten.slotKeys;
      if (rewritten.isDaily) isDaily = true;
      if (rewritten.usesNoQuarterBatch) computationImports.add('noQuarterBatch');
      edits.push({ start: target.getStart(), end: target.getEnd(), text: rewritten.text });
    }
    text = applyEdits(text, edits);
  }

  // 階段 4：import 整理。
  {
    const sf = parse(text);
    const groupHelpersUsed = WRITER_GROUP_HELPERS.filter((h) => new RegExp(`\\b${h}\\(`).test(text));
    const coordinateNames = new Set<string>(groupHelpersUsed);
    for (const imp of sf.getImportDeclarations()) {
      const spec = imp.getModuleSpecifierValue();
      if (spec.endsWith('shared/ports/financialDataPorts') || spec.endsWith('/pitOutcome')) {
        if (spec.endsWith('/pitOutcome')) {
          for (const named of imp.getNamedImports()) {
            if (['BasisOutcome', 'StandardBasisPitOutcome', 'QuarterlyPitOutcomeBase'].includes(named.getName())) named.remove();
          }
          if (imp.getNamedImports().length > 0) continue;
        }
        imp.remove();
        continue;
      }
      if (spec.endsWith('/metricValueWriter')) {
        for (const named of imp.getNamedImports()) {
          const name = named.getName();
          if (['writeOrSkip', 'writeMetricValue'].includes(name) || WRITER_GROUP_HELPERS.includes(name)) continue;
          if (name === 'MetricValueWriteOutcome' || name === 'MetricValueCoordinate') coordinateNames.add(`type ${name}`);
          else manual.push(`metricValueWriter 的 import '${name}' 沒有對照，要手動處理`);
        }
        imp.remove();
        continue;
      }
      if (spec.startsWith('@/infrastructure/')) {
        let allHandled = true;
        for (const named of imp.getNamedImports()) {
          const name = named.getName();
          const portModule = INFRA_TYPE_TO_PORT_MODULE[name];
          if (portModule) {
            const renamed = INFRA_TYPE_RENAME[name];
            const existing = sf.getImportDeclaration((d) => d.getModuleSpecifierValue() === portModule);
            const structure = renamed ? { name: renamed, alias: name } : { name };
            if (existing) existing.addNamedImport(structure);
            else sf.addImportDeclaration({ moduleSpecifier: portModule, namedImports: [structure], isTypeOnly: true });
          } else if (!DIRECT_FUNCTION_TO_DEPS[name] && !LATEST_QUARTER_FUNCTION_TO_SOURCE[name]) {
            allHandled = false;
            manual.push(`infrastructure import '${name}'（${spec}）沒有對照表，要手動處理`);
          }
        }
        if (allHandled) imp.remove();
      }
    }
    if (coordinateNames.size > 0) {
      sf.addImportDeclaration({
        moduleSpecifier: '@/domain/metrics/coordinate',
        namedImports: [...coordinateNames].map((n) => (n.startsWith('type ') ? { name: n.slice(5), isTypeOnly: true } : { name: n })),
      });
    }
    computationImports.add(isDaily ? 'type DailyComputationBatch' : 'type ComputationBatch');
    const sorted = [...computationImports].sort((a, b) => a.replace('type ', '').localeCompare(b.replace('type ', '')));
    sf.addImportDeclaration({
      moduleSpecifier: '@/domain/metrics/computation',
      namedImports: sorted.map((n) => (n.startsWith('type ') ? { name: n.slice(5), isTypeOnly: true } : { name: n })),
    });
    sf.addImportDeclaration({ moduleSpecifier: '@/application/metrics/deps', namedImports: [{ name: 'PitDeps' }], isTypeOnly: true });
    text = sf.getFullText();
  }

  const orderedKeys = DEPS_KEY_ORDER.filter((k) => depsKeys.has(k));
  text = text.replace('__DEPS_KEYS__', orderedKeys.map((k) => `'${k}'`).join(' | ') || 'never');
  text = text.replace('__BATCH_TYPE__', isDaily ? 'DailyComputationBatch' : 'ComputationBatch');
  text = text.replace('__SLOT_KEYS__', slotKeys.map((k) => `'${k}'`).join(' | ') || 'never');
  if (slotKeys.length === 0) manual.push('推不出 slot key（回傳物件不是固定欄位），XxxComputationBatch 的型別參數要手動填');
  if (orderedKeys.length === 0) manual.push('推不出任何 deps key（XxxDeps 是 Pick<PitDeps, never>），請確認');

  const withoutLineComments = text.replace(/\/\/.*$/gm, '');
  for (const marker of ['financialDataAdapter', 'writeMetricValue', 'writeOrSkip', '@/infrastructure/', 'StandardBasisPitOutcome', 'QuarterlyPitOutcomeBase', 'BasisOutcome']) {
    if (withoutLineComments.includes(marker)) manual.push(`殘留 '${marker}'`);
  }
  if (/(?<!deps\.|')\bstatements\b/.test(withoutLineComments)) manual.push("殘留識別字 'statements'（註解以外）");

  return { text: matchEol(original, text), shimExtras, manual, depsKeys: orderedKeys, slotKeys, computeName, depsTypeName };
};

const buildShim = (metricName: string, computeName: string, oldFunctionName: string, extras: string[], newFileBase: string): string => {
  const pitOutcomeImports = ['StandardBasisPitOutcome', 'QuarterlyPitOutcomeBase', 'BasisOutcome'].filter((name) => extras.some((e) => new RegExp(`\\b${name}\\b`).test(e)));
  const outcomeTypeName = extras.map((e) => /export (?:type|interface) (\w+)/.exec(e)?.[1]).find(Boolean) ?? null;
  return [
    `import { runLegacyPit } from '@/application/metrics/legacyBridge';`,
    `import { ${computeName} } from './${newFileBase}';`,
    ...(pitOutcomeImports.length > 0 ? [`import type { ${pitOutcomeImports.join(', ')} } from '@/application/metrics/pitOutcome';`] : []),
    '',
    `// **暫時性 shim**（2026-09-17 Phase 3）：${metricName} 的計算本體搬到 ${newFileBase}.ts（純計算、deps 注入），這裡只保留舊名稱`,
    `// ${oldFunctionName}(query) 給 scripts/ 跟既有整合測試用，回傳形狀跟以前完全一樣（persistComputations 攤平後的結果）。`,
    `// Phase 3 收尾時 scripts 改 import bootstrap 綁定好的版本，這支檔案刪除。`,
    `export * from './${newFileBase}';`,
    '',
    ...extras.map((e) => e.trim()),
    ...(extras.length > 0 ? [''] : []),
    // 連舊的回傳「型別」也保留（StandardBasisPitOutcome 的 q/ttm/fy 都是選填，scripts 有讀不存在欄位的寫法，
    // 精確的 PersistedBatch 型別會讓它們編不過）。
    outcomeTypeName
      ? `export const ${oldFunctionName} = runLegacyPit(${computeName}) as (query: Parameters<typeof ${computeName}>[0]) => Promise<${outcomeTypeName}>;`
      : `export const ${oldFunctionName} = runLegacyPit(${computeName});`,
    '',
  ].join('\n');
};

// ---- provenance：get*Provenance.ts / resolve*ProvenanceInputs.ts 加 deps 參數 ----
// computeFileBase/depsTypeName 為 null 代表「這個資料夾沒有 compute，provenance 借用別的資料夾的 resolver」
// （例如 inventoryTurnover 借 turnoverRatio 的），此時 deps 型別直接用整份 PitDeps（反正綁的是 legacyPitDeps）。
const rewriteProvenance = (original: string, computeFileBase: string | null, depsTypeName: string | null): { text: string; manual: string[]; changed: boolean } => {
  const manual: string[] = [];
  const depsKeys = new Set<DepsKey>();
  let text = original;
  let usesComputeResolver = false;

  {
    const sf = parse(text);
    const edits: TextEdit[] = [];
    const directImportAliases = new Map<string, string>();
    for (const imp of sf.getImportDeclarations()) {
      if (!imp.getModuleSpecifierValue().startsWith('@/infrastructure/')) continue;
      for (const named of imp.getNamedImports()) {
        const originalName = named.getName();
        const local = named.getAliasNode()?.getText() ?? originalName;
        if (DIRECT_FUNCTION_TO_DEPS[originalName] || LATEST_QUARTER_FUNCTION_TO_SOURCE[originalName]) directImportAliases.set(local, originalName);
      }
    }
    for (const id of sf.getDescendantsOfKind(SyntaxKind.Identifier)) {
      const name = id.getText();
      const parent = id.getParent();
      if (!parent || isImportContext(parent) || Node.isParameterDeclaration(parent)) continue;
      if (!Node.isCallExpression(parent) || parent.getExpression() !== id) {
        if (directImportAliases.has(name)) manual.push(`直接 import 的 ${name} 以非呼叫的形式被使用，要手動改`);
        continue;
      }
      const call = parent;
      const originalName = directImportAliases.get(name);
      const insertAt = afterLastArg(call);
      if (originalName) {
        const direct = DIRECT_FUNCTION_TO_DEPS[originalName];
        if (direct) {
          depsKeys.add(direct.key);
          edits.push({ start: id.getStart(), end: id.getEnd(), text: `deps.${direct.key}.${direct.method}` });
        } else {
          const source = LATEST_QUARTER_FUNCTION_TO_SOURCE[originalName]!;
          depsKeys.add('quarters');
          const args = call.getArguments();
          const argsText = args.length > 0 ? text.slice(args[0]!.getStart(), args[args.length - 1]!.getEnd()) : '';
          edits.push({ start: call.getStart(), end: call.getEnd(), text: `deps.quarters.latestQuarterWith('${source}', ${argsText})` });
        }
        continue;
      }
      const argCount = call.getArguments().length;
      if ((name === 'resolveQuarterOrLatest' && argCount === 2) || (name === 'getLatestAvailableQuarter' && argCount === 4)) {
        depsKeys.add('quarters');
        edits.push({ start: insertAt, end: insertAt, text: ', deps.quarters' });
      } else if (name === 'resolveKnowledgeDate' && argCount === 2) {
        depsKeys.add('announcements');
        edits.push({ start: insertAt, end: insertAt, text: ', deps.announcements' });
      } else if (/^(resolve|get)\w+(QuarterData|Inputs|Signals|Data|ProvenanceInputs)$/.test(name) && argCount >= 1 && call.getArguments()[argCount - 1]?.getText() !== 'deps') {
        // 共用 compute 的 resolver（或同資料夾的 resolve*ProvenanceInputs）：把整份 deps 傳下去
        usesComputeResolver = true;
        edits.push({ start: insertAt, end: insertAt, text: ', deps' });
      }
    }
    if (edits.length === 0) return { text, manual: [], changed: false };
    text = applyEdits(text, edits);
  }

  // 傳整份 deps 給 resolver 時，deps 型別沿用 compute 的 XxxDeps（跨資料夾借用時用整份 PitDeps）；否則用自己的 Pick。
  const ownPick = `Pick<PitDeps, ${DEPS_KEY_ORDER.filter((k) => depsKeys.has(k)).map((k) => `'${k}'`).join(' | ') || 'never'}>`;
  const depsTypeText = usesComputeResolver ? (depsTypeName ?? 'PitDeps') : ownPick;
  if (usesComputeResolver && depsTypeName && depsKeys.size > 0) manual.push(`同時直接用 port（${[...depsKeys].join(',')}）又呼叫 resolver：deps 型別暫用 ${depsTypeName}，請確認涵蓋`);

  // 匯出的函式跟同檔的內部 helper（getAnnualCapex 之類）一視同仁：本體用到 deps 就加參數、呼叫端補引數；
  // 呼叫端補了 deps 之後它自己也「用到 deps」了，所以迭代到沒有新變化為止（最多 4 輪）。
  for (let round = 0; round < 4; round += 1) {
    const sf = parse(text);
    const edits: TextEdit[] = [];
    const patched = new Map<string, number>(); // 這一輪加了 deps 參數的函式 → 原本的參數個數
    for (const decl of sf.getVariableDeclarations()) {
      const arrow = decl.getInitializerIfKind(SyntaxKind.ArrowFunction);
      if (!arrow) continue;
      const params = arrow.getParameters();
      if (params.some((p) => p.getName() === 'deps')) continue;
      // 只有本體真的用到 deps 的函式才加參數——同檔匯出的純 helper（growthPct 之類）不能被塞一個沒人用的參數。
      if (!/\bdeps\b/.test(arrow.getBody().getText())) continue;
      const last = params[params.length - 1];
      if (!last) {
        manual.push(`${decl.getName()} 沒有參數，deps 要手動加`);
        continue;
      }
      edits.push({ start: last.getEnd(), end: last.getEnd(), text: `, deps: ${depsTypeText}` });
      patched.set(decl.getName(), params.length);
    }
    for (const call of sf.getDescendantsOfKind(SyntaxKind.CallExpression)) {
      const callee = call.getExpression();
      if (!Node.isIdentifier(callee)) continue;
      const expected = patched.get(callee.getText());
      if (expected === undefined) continue;
      const args = call.getArguments();
      if (args.length === expected && args[args.length - 1]?.getText() !== 'deps') {
        edits.push({ start: afterLastArg(call), end: afterLastArg(call), text: ', deps' });
      }
    }
    if (edits.length === 0) break;
    text = applyEdits(text, edits);
  }

  {
    const sf = parse(text);
    for (const imp of sf.getImportDeclarations()) {
      const spec = imp.getModuleSpecifierValue();
      if (spec.startsWith('@/infrastructure/')) {
        let allHandled = true;
        for (const named of imp.getNamedImports()) {
          const name = named.getName();
          const portModule = INFRA_TYPE_TO_PORT_MODULE[name];
          if (portModule) {
            const renamed = INFRA_TYPE_RENAME[name];
            const existing = sf.getImportDeclaration((d) => d.getModuleSpecifierValue() === portModule);
            const structure = renamed ? { name: renamed, alias: name } : { name };
            if (existing) existing.addNamedImport(structure);
            else sf.addImportDeclaration({ moduleSpecifier: portModule, namedImports: [structure], isTypeOnly: true });
          } else if (!DIRECT_FUNCTION_TO_DEPS[name] && !LATEST_QUARTER_FUNCTION_TO_SOURCE[name]) {
            allHandled = false;
            manual.push(`infrastructure import '${name}'（${spec}）沒有對照表，要手動處理`);
          }
        }
        if (allHandled) imp.remove();
      } else if (/compute\w+Pit$/.test(spec)) {
        // 借用的 resolver 改指新檔（舊路徑的 shim 雖然 export * 也通，但不要留下對暫時檔案的依賴）
        imp.setModuleSpecifier(spec.replace(/(compute\w+)Pit$/, '$1'));
      }
    }
    if (usesComputeResolver && computeFileBase && depsTypeName) {
      const computeImport = sf.getImportDeclaration((d) => d.getModuleSpecifierValue().endsWith(`/${computeFileBase}`));
      if (computeImport) {
        if (!computeImport.getNamedImports().some((n) => n.getName() === depsTypeName)) computeImport.addNamedImport({ name: depsTypeName, isTypeOnly: true });
      } else sf.addImportDeclaration({ moduleSpecifier: `./${computeFileBase}`, namedImports: [{ name: depsTypeName }], isTypeOnly: true });
    } else {
      sf.addImportDeclaration({ moduleSpecifier: '@/application/metrics/deps', namedImports: [{ name: 'PitDeps' }], isTypeOnly: true });
    }
    text = sf.getFullText();
  }

  const withoutLineComments = text.replace(/\/\/.*$/gm, '');
  for (const marker of ['@/infrastructure/', 'financialDataAdapter']) {
    if (withoutLineComments.includes(marker)) manual.push(`殘留 '${marker}'`);
  }
  return { text: matchEol(original, text), manual, changed: true };
};

// ---- provenanceResolvers.ts：`xxx: getXxxProvenance,` → 綁 legacyPitDeps ----
const rewriteResolverEntries = (text: string, provenanceFunctionNames: string[]): string => {
  let out = text;
  for (const fn of provenanceFunctionNames) {
    const pattern = new RegExp(`^(\\s+)(\\w+): ${fn},$`, 'm');
    out = out.replace(pattern, `$1$2: (query) => ${fn}(query, legacyPitDeps),`);
  }
  if (!out.includes("from '@/application/metrics/legacyBridge'")) {
    out = out.replace(/^(import [^\n]+\n)/, `$1import { legacyPitDeps } from '@/application/metrics/legacyBridge';\n`);
  }
  return out;
};

// ---- 驅動 ----
const parseArgs = (argv: string[]) => {
  const metrics: string[] = [];
  const families: string[] = [];
  let dryRun = false;
  let show = false;
  for (let i = 0; i < argv.length; i += 1) {
    if (argv[i] === '--metric' && argv[i + 1]) metrics.push(argv[++i]!);
    else if (argv[i] === '--family' && argv[i + 1]) families.push(argv[++i]!);
    else if (argv[i] === '--dry-run') dryRun = true;
    else if (argv[i] === '--show') show = true; // 印出改寫後的完整內容（配 --dry-run 檢查產出）
  }
  return { metrics, families, dryRun, show };
};

const rel = (p: string) => relative(process.cwd(), p).replaceAll('\\', '/');

const showText = (label: string, text: string): void => {
  console.log(`\n===== ${label} =====\n${text}\n===== end =====`);
};

const PROVENANCE_FILE = /^(get\w+Provenance|resolve\w+ProvenanceInputs)\.ts$/;

const migrateProvenanceFile = (provPath: string, computeFileBase: string | null, depsTypeName: string | null, dryRun: boolean, show: boolean, resolverEdits: string[]): void => {
  const prov = rewriteProvenance(readFileSync(provPath, 'utf8'), computeFileBase, depsTypeName);
  if (!prov.changed) {
    console.log(`[provenance] ${rel(provPath)}：沒有需要改的呼叫（不碰 I/O）`);
    return;
  }
  console.log(`[provenance] ${rel(provPath)} 加 deps`);
  for (const m of prov.manual) console.log(`  MANUAL: ${m}`);
  if (show) showText(rel(provPath), prov.text);
  if (!dryRun) writeFileSync(provPath, prov.text);
  const fnName = /export const (get\w+Provenance)\b/.exec(prov.text)?.[1];
  if (fnName) resolverEdits.push(fnName);
};

const migrateMetricDir = (dir: string, dryRun: boolean, show: boolean, resolverEdits: string[]): void => {
  const files = readdirSync(dir);
  const pitFiles = files.filter((f) => /^compute\w+Pit\.ts$/.test(f));
  if (pitFiles.length === 0) {
    // 只有 provenance 的資料夾（借用別的 family 的 resolver，或自己直接查 port）
    for (const provFile of files.filter((f) => PROVENANCE_FILE.test(f))) {
      const provPath = join(dir, provFile);
      if (readFileSync(provPath, 'utf8').includes('deps:')) {
        console.log(`[skip] ${rel(provPath)} 已經有 deps 參數`);
        continue;
      }
      migrateProvenanceFile(provPath, null, null, dryRun, show, resolverEdits);
    }
    return;
  }
  for (const pitFile of pitFiles) {
    const pitPath = join(dir, pitFile);
    const content = readFileSync(pitPath, 'utf8');
    const newBase = pitFile.replace(/Pit\.ts$/, '');
    if (/runLegacyPit(Nested)?\(/.test(content)) {
      // compute 已經遷移過：只補處理還沒拿到 deps 參數的 provenance（例如手動 revert 後重跑）。
      const shimComputeName = /runLegacyPit(?:Nested)?\((\w+)/.exec(content)?.[1];
      const shimDepsTypeName = shimComputeName ? `${shimComputeName.slice('compute'.length)}Deps` : null;
      for (const provFile of files.filter((f) => PROVENANCE_FILE.test(f))) {
        const provPath = join(dir, provFile);
        if (readFileSync(provPath, 'utf8').includes('deps:')) continue;
        migrateProvenanceFile(provPath, newBase, shimDepsTypeName, dryRun, show, resolverEdits);
      }
      console.log(`[skip] ${rel(pitPath)} 已經是 shim`);
      continue;
    }
    const newPath = join(dir, `${newBase}.ts`);
    const oldFunctionName = /export const (computeAndWrite\w+)\b/.exec(content)?.[1];
    if (!oldFunctionName) {
      console.log(`[MANUAL] ${rel(pitPath)}：找不到 export const computeAndWrite*`);
      continue;
    }
    let result: ComputeRewrite;
    try {
      result = rewriteCompute(content);
    } catch (error) {
      console.log(`[MANUAL] ${rel(pitPath)}：${error instanceof Error ? error.message : String(error)}`);
      continue;
    }
    const shim = matchEol(content, buildShim(basename(dir), result.computeName, oldFunctionName, result.shimExtras, newBase));
    console.log(`[compute] ${rel(pitPath)} → ${rel(newPath)}  deps=${result.depsKeys.join(',') || '(none)'}  slots=${result.slotKeys.join(',') || '?'}`);
    for (const m of result.manual) console.log(`  MANUAL: ${m}`);
    if (show) {
      showText(rel(newPath), result.text);
      showText(rel(pitPath), shim);
    }
    if (!dryRun) {
      execFileSync('git', ['mv', pitPath, newPath], { stdio: 'inherit' });
      writeFileSync(newPath, result.text);
      writeFileSync(pitPath, shim);
    }

    for (const provFile of files.filter((f) => PROVENANCE_FILE.test(f))) {
      migrateProvenanceFile(join(dir, provFile), newBase, result.depsTypeName, dryRun, show, resolverEdits);
    }
  }
};

const main = (): void => {
  const { metrics, families, dryRun, show } = parseArgs(process.argv.slice(2));
  const dirs: string[] = [...metrics];
  for (const family of families) {
    for (const entry of readdirSync(family)) {
      const full = join(family, entry);
      if (statSync(full).isDirectory() && readdirSync(full).some((f) => /^compute\w+Pit\.ts$/.test(f) || PROVENANCE_FILE.test(f))) dirs.push(full);
    }
  }
  if (dirs.length === 0) {
    console.error('用法：--metric <dir> | --family <dir> [--dry-run]');
    process.exitCode = 1;
    return;
  }
  const resolverEdits: string[] = [];
  for (const dir of dirs) {
    if (!existsSync(dir)) {
      console.log(`[MANUAL] 找不到資料夾 ${dir}`);
      continue;
    }
    migrateMetricDir(dir, dryRun, show, resolverEdits);
  }
  if (resolverEdits.length > 0) {
    const resolversPath = join(process.cwd(), 'src', 'application', 'metrics', 'shared', 'provenance', 'provenanceResolvers.ts');
    const before = readFileSync(resolversPath, 'utf8');
    const after = rewriteResolverEntries(before, resolverEdits);
    const changedCount = resolverEdits.filter((fn) => before.includes(`: ${fn},`)).length;
    console.log(`[resolvers] provenanceResolvers.ts 改綁 ${changedCount}/${resolverEdits.length} 個項目`);
    if (!dryRun && after !== before) writeFileSync(resolversPath, after);
  }
  console.log(dryRun ? '[dry-run] 沒有寫入任何檔案。' : '[done] 接著跑：pnpm typecheck && pnpm lint && npx vitest run --project unit');
};

main();
