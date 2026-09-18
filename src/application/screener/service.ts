import type { AppDeps } from '@/application/deps';
import { ValidationError } from '@/application/errors';
import type { ScreenerFilterCondition, ScreenerIndexedField, ScreenerSortSpec } from '@/application/ports/metricValueQueries';
import { resolveFieldOrThrow, type FieldRef } from './fieldResolver';
import type { ScreenerColumnInput, ScreenerFilterInput, ScreenerResponse, ScreenerRankingResponse, ScreenerRow, ScreenerValue, ScreenerNullReason, CompanyRankResult, FieldDistributionResult } from './types';

// ScreenerValidationError 就是 application 共用的 ValidationError（同一個 class，instanceof 判斷不變）；
// 既有測試沿用這個名字。
export { ValidationError as ScreenerValidationError };

// 2026-09-17 Phase 4：從 http/modules/screener/service.ts 搬來，SQL 執行改走 deps.metricValueQueries
// （Prisma.Sql 不再出 infrastructure）、公司名稱/類股改走 companyProfiles/industryReference，邏輯逐字不變。
export type ScreenerDeps = Pick<AppDeps, 'metricValueQueries' | 'companyProfiles' | 'industryReference'>;

// $queryRaw 對 Decimal 欄位可能回傳 Decimal 物件、字串、或原生 number，Number() 三種都能吃；
// knowledge_date 統一切成 YYYY-MM-DD。companyName 先留空，parseRows 本身不查名稱（查名稱要
// 另外打 twse/tpex，不是同一個資料庫查得到的東西）——由 attachCompanyNames 事後批次補上，
// 兩件事分開做，parseRows 保持單純同步轉換。
// 2026-09-13 補上 nullReason（見 screenerQueries.ts buildSelectColumnsSql 的說明）——這一列
// 完全查無資料時（symbol 從沒被算過這支指標）n{index} 也會是 undefined/null，跟「算過但
// value 為 null」在 SQL 層面無法區分（LEFT JOIN 到的整列都是 null），一律回傳 null，
// 呼叫端要精確分辨兩者請改查 GET /companies/metric-history。
const parseRows = (rows: Record<string, unknown>[], fields: ScreenerIndexedField[]): Omit<ScreenerRow, 'companyName'>[] =>
  rows.map((row) => {
    const values: Record<string, ScreenerValue> = {};
    for (const f of fields) {
      const rawValue = row[`v${f.index}`];
      const value = rawValue !== null && rawValue !== undefined ? Number(rawValue) : null;
      const date = row[`k${f.index}`];
      const knowledgeDate = date ? (date instanceof Date ? date.toISOString().slice(0, 10) : String(date).slice(0, 10)) : null;
      const nullReason = (row[`n${f.index}`] as ScreenerNullReason | null | undefined) ?? null;
      values[f.field] = { value, knowledgeDate, nullReason };
    }
    return { symbol: row.symbol as string, values };
  });

// 這一頁結果實際出現的 symbol 才查，不是全市場，跟排序公司名稱撞到的跨資料庫排序限制無關
// （那個是要排序全部資料再分頁，這裡只是幫已經決定好的這幾筆補顯示用欄位）。查無資料的
// symbol（理論上不該發生，filter/screener 出來的 symbol 一定是真公司）companyName 是 null。
const attachCompanyNames = async (rows: Omit<ScreenerRow, 'companyName'>[], deps: Pick<AppDeps, 'companyProfiles'>): Promise<ScreenerRow[]> => {
  const names = await deps.companyProfiles.getCompanyNamesForSymbols(rows.map((row) => row.symbol));
  return rows.map((row) => ({ ...row, companyName: names.get(row.symbol) ?? null }));
};

// sortField 只接受 "symbol" 或已經列在 columns 裡的 field。不支援排公司名稱：company_profile
// 在 twse/tpex，是跟 analysis DB 完全獨立的另一個 Postgres 專案，screener 的查詢引擎沒有
// 跨資料庫 JOIN 的機制。
const resolveSort = (sortField: string | undefined, sortOrder: 'asc' | 'desc' | undefined, columns: FieldRef[]): ScreenerSortSpec | null => {
  if (!sortField) return null;
  if (!sortOrder) {
    throw new ValidationError('有給 sortField 就要一起給 sortOrder。');
  }
  if (sortField === 'symbol') return { field: 'symbol', order: sortOrder };
  if (!columns.some((c) => c.field === sortField)) {
    throw new ValidationError(`sortField "${sortField}" 要嘛是 "symbol"，要嘛要先出現在 columns 裡才能排序。`);
  }
  return { field: sortField, order: sortOrder };
};

// 2026-09-11 新增：類股篩選（sectorCodes）resolve 成候選 symbol 陣列——用的是證交所類股
// 分類（twse-ts/tpex-ts company_profile.industry，例如「24」半導體業），不是財政部稅籍
// 分類，這是投資人習慣、可以對應「半導體業」「電子零組件業」這類熟悉類股名稱的那一套。任一
// 代碼不合法就直接 400，不是靜默忽略打錯的代碼（比照 fieldResolver 對未知 metricCode 一律
// 400 的既有慣例）。sectorCodes 沒給或空陣列回傳 null，screen/rank 收到 null 就不多加這個
// WHERE 條件，行為完全不變。
const resolveSectorCandidateSymbols = async (sectorCodes: string[] | undefined, deps: Pick<AppDeps, 'industryReference'>): Promise<string[] | null> => {
  if (!sectorCodes || sectorCodes.length === 0) return null;
  for (const code of sectorCodes) {
    if (!deps.industryReference.isValidSecuritiesSectorCode(code)) {
      throw new ValidationError(`sectorCodes 裡的 "${code}" 不是合法的證券類股代碼，請查 GET /industries/securities-sectors 取得合法代碼。`);
    }
  }
  return [...(await deps.industryReference.listCompaniesBySectorCodes(sectorCodes))];
};

export interface ScreenerRequest {
  filters: ScreenerFilterInput[];
  columns: ScreenerColumnInput[];
  page: number;
  pageSize: number;
  sortField?: string | undefined;
  sortOrder?: 'asc' | 'desc' | undefined;
  sectorCodes?: string[] | undefined;
}

export const runScreener = async (request: ScreenerRequest, deps: ScreenerDeps): Promise<ScreenerResponse> => {
  const { filters: filterInputs, columns: columnInputs, page, pageSize } = request;

  const filters: ScreenerFilterCondition[] = filterInputs.map((f) => ({ ...resolveFieldOrThrow(f.field), min: f.min, max: f.max, exclude: f.exclude ?? false }));
  const columns: FieldRef[] = columnInputs.map((c) => resolveFieldOrThrow(c.field));
  const sort = resolveSort(request.sortField, request.sortOrder, columns);
  const candidateSymbols = await resolveSectorCandidateSymbols(request.sectorCodes, deps);

  if (filters.length === 0 && columns.length === 0) {
    throw new ValidationError('filters 跟 columns 至少要提供一個。');
  }

  const rows = await deps.metricValueQueries.screen(filters, columns, page, pageSize, sort, candidateSymbols);

  const indexedColumns: ScreenerIndexedField[] = columns.map((c, index) => ({ ...c, index }));
  const results = await attachCompanyNames(parseRows(rows, indexedColumns), deps);
  const count = rows.length > 0 ? Number(rows[0]!.total_count) : 0;

  return { count, page, pageSize, totalPages: count === 0 ? 0 : Math.ceil(count / pageSize), results };
};

export interface ScreenerRankingRequest {
  field: string;
  direction: 'asc' | 'desc';
  limit: number;
  columns: string[];
  sectorCodes?: string[] | undefined;
}

export const runScreenerRanking = async (request: ScreenerRankingRequest, deps: ScreenerDeps): Promise<ScreenerRankingResponse> => {
  const rankedField = resolveFieldOrThrow(request.field);
  const columns = request.columns.map((field) => resolveFieldOrThrow(field));
  const candidateSymbols = await resolveSectorCandidateSymbols(request.sectorCodes, deps);

  const rows = await deps.metricValueQueries.rank(rankedField, request.direction, request.limit, columns, candidateSymbols);

  const combinedFields: ScreenerIndexedField[] = [rankedField, ...columns].map((c, index) => ({ ...c, index }));
  return { results: await attachCompanyNames(parseRows(rows, combinedFields), deps) };
};

// 查單一公司在全市場某個欄位的排名——跟 runScreenerRanking（取前 N 名清單）是互補的
//兩種查詢，這支回答「這家公司自己排第幾/贏過幾%」，不是「前 N 名是誰」。found:false
// 代表這家公司這個欄位查無資料（從沒被算過或算出來是 null），此時 rank/totalCount/
// topPercent 皆為 null。topPercent 是「這家公司排在全市場前百分之多少」（rank ÷
// totalCount × 100，四捨五入到小數點後一位）——數字越小代表排名越前面，例如 5 代表
// 排在全市場前 5%；跟「百分位（percentile）」是相反方向的敘述習慣（百分位越高代表越好，
// topPercent 越低代表越好），刻意選 topPercent 這個命名是因為比較貼近「贏過前 X%」這種
// 中文口語問法。
export const getCompanyRank = async (symbol: string, fieldInput: string, direction: 'asc' | 'desc', deps: Pick<AppDeps, 'metricValueQueries'>): Promise<CompanyRankResult> => {
  const field = resolveFieldOrThrow(fieldInput);

  const rows = await deps.metricValueQueries.companyRank(symbol, field, direction);

  const row = rows[0];
  if (!row) {
    return { symbol, field: fieldInput, found: false, value: null, rank: null, totalCount: null, topPercent: null };
  }

  const totalCount = Number(row.total_count);
  const rank = Number(row.rank);
  const topPercent = Math.round((rank / totalCount) * 1000) / 10;

  return {
    symbol,
    field: fieldInput,
    found: true,
    value: row.value !== null && row.value !== undefined ? Number(row.value) : null,
    rank,
    totalCount,
    topPercent,
  };
};

// 給「已經在畫面上的這幾檔股票，補一個新欄位」用，不是篩選查詢——每個要求的 symbol 都保證
// 出現在 results 裡，查不到資料的欄位是 null，不會因為沒資料整個 symbol 被拿掉。
export const runScreenerValues = async (request: { symbols: string[]; columns: ScreenerColumnInput[] }, deps: Pick<AppDeps, 'metricValueQueries' | 'companyProfiles'>): Promise<{ results: ScreenerRow[] }> => {
  const symbols = [...new Set(request.symbols)];
  const columns = request.columns.map((c) => resolveFieldOrThrow(c.field));

  if (symbols.length === 0) return { results: [] };

  const rows = await deps.metricValueQueries.values(symbols, columns);

  const indexedColumns: ScreenerIndexedField[] = columns.map((c, index) => ({ ...c, index }));
  return { results: await attachCompanyNames(parseRows(rows, indexedColumns), deps) };
};

// 全市場某個欄位的分布（直方圖用）——2026-09-18 應 web-nuxt「殖利率市場排名」卡片展開需求
// 新增，取代他們原本用 POST /screener 的 count-only 查詢在前端手工打十幾次固定區間湊出來的
// 粗粒度長條圖。bins 的 count 加總永遠等於 totalCount，見 types.ts 的 FieldDistributionResult
// 說明；離群值不會被丟掉，只是視覺上落進最左/最右一格。
export const getFieldDistribution = async (fieldInput: string, bins: number, deps: Pick<AppDeps, 'metricValueQueries'>): Promise<FieldDistributionResult> => {
  const field = resolveFieldOrThrow(fieldInput);
  const result = await deps.metricValueQueries.distribution(field, bins);
  return { field: fieldInput, ...result };
};
