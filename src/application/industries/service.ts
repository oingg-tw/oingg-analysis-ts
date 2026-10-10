import type { AppDeps } from '@/application/deps';
import { NotFoundError, ValidationError } from '@/application/errors';
import { resolveFieldOrThrow } from '@/application/screener/fieldResolver';
import { resolveTimeframeForMetric } from '@/application/metrics/resolveTimeframeForMetric';
import { metricDefinitionRegistry } from '@/application/metrics/metricDefinitionRegistry';
import { summarizeSectorDividends } from '@/domain/industry/sectorDividendSummary';
import { summarizeQuartiles, summarizeSectorMonthlyRevenue, summarizeSectorPeriods, type QuartileSummary } from '@/domain/industry/sectorAggregates';
import type { SectorDividendSummaryResult, SectorMetricHistoryResult, SectorMonthlyRevenueHistoryResult, SectorSummaryResult, SecuritiesIndustrySectorsResult } from './types';

// 2026-09-17 Phase 4：從 http/modules/industries/controller.ts 搬來，快取存取器改走 deps.industryReference、
// 公司名稱改走 deps.companyProfiles，邏輯逐字不變。
// 2026-09-20 使用者要求完全捨棄 playwright-py 供應鏈分類，原本這裡的 getIndustryChainClassification/
// getIndustryChainClusters/getIndustryChainTree 三個 use case（對應已刪除的 GET /industries/
// chain-{classification,clusters,tree} 三支端點）已移除。
export type IndustriesDeps = Pick<AppDeps, 'industryReference' | 'companyProfiles' | 'metricValueQueries' | 'monthlyRevenue'>;

// 2026-10-02 使用者拍板下架 GET /industries/tree、/industries/flat（gov 稅籍五層分類瀏覽，零呼叫），getIndustryTree／getIndustryFlat 移除。

// 2026-09-11 應使用者要求新增——給 screener 的 industryCodes 產業篩選（見
// application/screener）取得合法代碼用，也可以單獨拿來做類股瀏覽 UI。跟上面
// GET /industries/tree 是不同分類體系（證交所類股 vs 財政部稅籍），刻意獨立端點，不合併。
export const getSecuritiesIndustrySectors = async (deps: Pick<AppDeps, 'industryReference'>): Promise<SecuritiesIndustrySectorsResult> => {
  const sectors = await deps.industryReference.listSecuritiesIndustrySectors();
  return { sectors: sectors.map((s) => ({ ...s, sectorCode: s.code, sectorName: s.name })) };
};

// 2026-09-30 使用者設計「產業分析圖表」（每個證交所類股一個點，Y 殖利率、X 股利 3 年成長率），彙總規則見
// domain/industry/sectorDividendSummary.ts。母體 = 上市＋上櫃、有類股代碼的公司（排除興櫃：沒有交易所每日
// 殖利率，放進來只會讓 companyCount 虛胖）。每家取各自最新一筆（screener 同一套 CTE）。
// 殖利率只收最新交易日往前 14 天內的值：停牌、下市前的舊殖利率不是現況（跟供給面 ERP 的
// listLatestDividendYieldWithMarketCap 同一個判斷）。
// 殖利率 0（沒配息）算進去——類股真實樣貌的一部分。2026-09-30 一度只算 > 0：證交所 8/28 起把沒配息改寫成空白、
// 上櫃仍寫 0，兩市場口徑不一致；已在讀取端統一成 0（見 domain/market/twseDividendYield.ts），這裡不再排除。
const YIELD_FRESHNESS_DAYS = 14;

export const getSectorDividendSummary = async (deps: Pick<AppDeps, 'companyProfiles' | 'metricValueQueries'>): Promise<SectorDividendSummaryResult> => {
  const { entries } = await deps.companyProfiles.listAllCompanyNames(Number.MAX_SAFE_INTEGER, 0);
  const companies = entries.filter((e) => !e.isEmerging && e.sectorCode !== null && e.sectorName !== null);
  const rows = await deps.metricValueQueries.values(
    companies.map((c) => c.symbol),
    [resolveFieldOrThrow('dividendYield.EOD'), resolveFieldOrThrow('dividendGrowthRate3y.FY')]
  );
  const bySymbol = new Map(rows.map((r) => [r.symbol as string, r]));
  const num = (v: unknown): number | null => (v === null || v === undefined ? null : Number(v));
  const time = (v: unknown): number | null => (v ? new Date(v as string | Date).getTime() : null);

  const yieldTimes = rows.map((r) => time(r.k0)).filter((t): t is number => t !== null);
  const latest = yieldTimes.length > 0 ? Math.max(...yieldTimes) : null;
  const cutoff = latest === null ? null : latest - YIELD_FRESHNESS_DAYS * 86_400_000;

  const sectors = summarizeSectorDividends(
    companies.map((c) => {
      const r = bySymbol.get(c.symbol);
      const t = time(r?.k0);
      return {
        sectorCode: c.sectorCode!,
        sectorName: c.sectorName!,
        dividendYield: t !== null && cutoff !== null && t >= cutoff ? num(r?.v0) : null,
        dividendGrowthRate3y: num(r?.v1),
      };
    })
  );
  return { dividendYieldTradeDate: latest === null ? null : new Date(latest).toISOString().slice(0, 10), sectors };
};

// ---- 2026-10-09 web-nuxt 產業分析三支類股端點（使用者核准），彙總規則見 domain/industry/sectorAggregates.ts。
// 母體跟 sector-dividend-summary 一樣：上市＋上櫃、有類股代碼（排除興櫃）。成員是「今天的分類」，已下市公司不在
// company_profile 裡、不會被算進去，所以早期各期是「現存公司的歷史」（openapi 有寫）。
const listedSectorMembers = async (deps: Pick<AppDeps, 'companyProfiles'>) => {
  const { entries } = await deps.companyProfiles.listAllCompanyNames(Number.MAX_SAFE_INTEGER, 0);
  return entries.filter((e) => !e.isEmerging && e.sectorCode !== null && e.sectorName !== null);
};

const sectorOrThrow = async (sectorCode: string, deps: Pick<AppDeps, 'companyProfiles'>) => {
  const members = (await listedSectorMembers(deps)).filter((e) => e.sectorCode === sectorCode);
  if (members.length === 0) throw new NotFoundError(`查無類股 "${sectorCode}" 的上市櫃公司，合法代碼見 GET /industries/securities-sectors。`, 'unknown_sector');
  return { sectorName: members[0]!.sectorName!, symbols: members.map((m) => m.symbol) };
};

export interface SectorMetricHistoryQuery {
  sectorCode: string;
  metricCode: string;
  timeframe: string;
  limit: number;
}

// 每一期只用那一期的值（不是 screener 那種各家最新一期混在一起）。只收季報型、非每股類：每股數字的大小取決於各家
// 股數，跨公司取中位數沒有意義；逐日型、月頻是不同的表、沒有「期」的概念。
export const getSectorMetricHistory = async ({ sectorCode, metricCode, timeframe, limit }: SectorMetricHistoryQuery, deps: Pick<AppDeps, 'companyProfiles' | 'metricValueQueries'>): Promise<SectorMetricHistoryResult> => {
  const field = resolveTimeframeForMetric(metricCode, timeframe, `${metricCode}.${timeframe}`);
  if (field.isDailyCadence || field.isMonthly) {
    throw new ValidationError(`metricCode "${metricCode}" 不是季報型指標，類股逐期中位數只支援季報型（timeframe Q／TTM／FY 等）。`, 'unsupported_timeframe');
  }
  if (metricDefinitionRegistry[metricCode]?.perShare) {
    throw new ValidationError(`metricCode "${metricCode}" 是每股類指標，數值大小取決於各家股數，跨公司取中位數沒有意義，不提供類股中位數。`, 'per_share_not_aggregatable');
  }
  const { sectorName, symbols } = await sectorOrThrow(sectorCode, deps);
  const rows = await deps.metricValueQueries.listPeriodValuesForSymbols(symbols, metricCode, field.periodType);
  const periods = summarizeSectorPeriods(rows.map((r) => ({ ...r, value: r.value === null ? null : Number(r.value) })));
  return { sectorCode, sectorName, metricCode, timeframe, entries: periods.slice(-limit) };
};

export const getSectorMonthlyRevenueHistory = async ({ sectorCode, limit }: { sectorCode: string; limit: number }, deps: Pick<AppDeps, 'companyProfiles' | 'monthlyRevenue'>): Promise<SectorMonthlyRevenueHistoryResult> => {
  const { sectorName, symbols } = await sectorOrThrow(sectorCode, deps);
  const months = summarizeSectorMonthlyRevenue(await deps.monthlyRevenue.listMonthlyRevenueForSymbols(symbols));
  const entries = months.slice(-limit);
  return { sectorCode, sectorName, total: months.length, hasMore: months.length > entries.length, entries };
};

export const MAX_SECTOR_SUMMARY_FIELDS = 10;

// 一般化的 sector-dividend-summary：每家取各自最新一筆（screener 同一套查詢，混期快照），按類股算四分位。
// web-nuxt 拿來換掉 34 次 screener 呼叫。
export const getSectorSummary = async ({ fields }: { fields: string }, deps: Pick<AppDeps, 'companyProfiles' | 'metricValueQueries'>): Promise<SectorSummaryResult> => {
  const names = [...new Set(fields.split(',').map((f) => f.trim()).filter((f) => f.length > 0))];
  if (names.length === 0) throw new ValidationError('fields 至少要指定一個，格式同 screener，例如 "revenueGrowthRate.TTM"。');
  if (names.length > MAX_SECTOR_SUMMARY_FIELDS) throw new ValidationError(`fields 最多 ${MAX_SECTOR_SUMMARY_FIELDS} 個，收到 ${names.length} 個。`);
  const refs = names.map((name) => resolveFieldOrThrow(name));

  const companies = await listedSectorMembers(deps);
  const rows = await deps.metricValueQueries.values(companies.map((c) => c.symbol), refs);
  const bySymbol = new Map(rows.map((r) => [r.symbol as string, r]));

  const groups = new Map<string, typeof companies>();
  for (const c of companies) groups.set(c.sectorCode!, [...(groups.get(c.sectorCode!) ?? []), c]);
  const sectors = [...groups.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([sectorCode, members]) => ({
      sectorCode,
      sectorName: members[0]!.sectorName!,
      companyCount: members.length,
      fields: Object.fromEntries(
        names.map((name, i): [string, QuartileSummary] => [
          name,
          summarizeQuartiles(members.flatMap((m) => {
            const v = bySymbol.get(m.symbol)?.[`v${i}`];
            return v === null || v === undefined ? [] : [Number(v)];
          })),
        ])
      ),
    }));
  return { sectors };
};
