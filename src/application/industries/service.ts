import type { AppDeps } from '@/application/deps';
import { resolveFieldOrThrow } from '@/application/screener/fieldResolver';
import { summarizeSectorDividends } from '@/domain/industry/sectorDividendSummary';
import type { SectorDividendSummaryResult, SecuritiesIndustrySectorsResult } from './types';

// 2026-09-17 Phase 4：從 http/modules/industries/controller.ts 搬來，快取存取器改走 deps.industryReference、
// 公司名稱改走 deps.companyProfiles，邏輯逐字不變。
// 2026-09-20 使用者要求完全捨棄 playwright-py 供應鏈分類，原本這裡的 getIndustryChainClassification/
// getIndustryChainClusters/getIndustryChainTree 三個 use case（對應已刪除的 GET /industries/
// chain-{classification,clusters,tree} 三支端點）已移除。
export type IndustriesDeps = Pick<AppDeps, 'industryReference' | 'companyProfiles' | 'metricValueQueries'>;

// 2026-10-02 使用者拍板下架 GET /industries/tree、/industries/flat（gov 稅籍五層分類瀏覽，零呼叫），getIndustryTree／getIndustryFlat 移除。

// 2026-09-11 應使用者要求新增——給 screener 的 industryCodes 產業篩選（見
// application/screener）取得合法代碼用，也可以單獨拿來做類股瀏覽 UI。跟上面
// GET /industries/tree 是不同分類體系（證交所類股 vs 財政部稅籍），刻意獨立端點，不合併。
export const getSecuritiesIndustrySectors = async (deps: Pick<AppDeps, 'industryReference'>): Promise<SecuritiesIndustrySectorsResult> => {
  const sectors = await deps.industryReference.listSecuritiesIndustrySectors();
  return { sectors };
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
