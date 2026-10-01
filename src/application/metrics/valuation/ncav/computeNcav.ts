import { resolveQuarterOrLatest } from '@/application/financials/latestQuarter';
import type { QuarterlyMetricQuery } from '@/domain/financials/quarterlyMetric';
import { resolveKnowledgeDate } from '../../knowledgeDate';
import type { MetricNullReason } from '../../../../domain/metrics/metricBasis';
import { rocYearToGregorian } from '@/domain/calendar/rocQuarter';
import { periodTypeGroup } from '@/domain/metrics/coordinate';
import { computation, type ComputationBatch, type ComputationSlot, noQuarterBatch, withFormulaVersion } from '@/domain/metrics/computation';

// 2026-09-27 formulaVersion 2：普通股權益扣特別股改扣發行價（清償時特別股拿回的金額），不是面額（使用者拍板「改成扣發行價」；
// 2838 每股淨值 19.65 → 17.8，見 domain/financials/outstandingCommonShares.ts preferredClaimThousands）。
const NCAV_FORMULA_VERSION = 2;
import type { PitDeps } from '@/application/metrics/deps';

// 這份檔案是 src/domainMetrics/ncav.ts 的獨立重新實作。純資產負債表時點快照，只有 Q 一種
// basis。2026-09-10 改回公司總額（不除以股數），理由見 ncavDefinition.ts 的說明——跟
// 新增的 marketCap 指標比較用「總額 vs 總額」，不需要股數這個中介變數，也因此不用再查
// capitalStock。

// 資產負債表欄位是千元（thousands），乘 1000 還原成新台幣元的公司總額。
const toTotalValue = (valueInThousands: bigint): number => Math.round(Number(valueInThousands) * 1000 * 100) / 100;


export type NcavDeps = Pick<PitDeps, 'statements' | 'quarters' | 'announcements' | 'shares'>;

export type NcavComputationBatch = ComputationBatch<'q'>;

// 2026-10-01 溯源表（getNcavProvenance.ts）要跟寫入路徑算出同一個數字：原本溯源表自己重算，特別股還是扣資產負債表的面額
// （2026-09-27 起寫入路徑扣發行價），1101 差 80 億。查詢與值抽成這支 resolver 共用，computeNcav 只負責 knowledge date 與組 slot；
// 計算本身逐字未改。
export const resolveNcavInputs = async (query: QuarterlyMetricQuery, deps: NcavDeps) => {
  const { symbol, dataType, subsidiaryCompanyId } = query;

  const resolvedQuarter = await resolveQuarterOrLatest(query, ['balanceSheet'], deps.quarters);

  if (!resolvedQuarter) {
    return null;
  }

  const { year, season } = resolvedQuarter;
  const rocYear = Number(year);
  const seasonNum = Number(season);
  const fiscalYear = rocYearToGregorian(rocYear);

  const key = { symbol, year: rocYear, quarter: seasonNum, dataType, subsidiaryCompanyId };
  const balanceSheet = await deps.statements.getBalanceSheet(key);
  const currentAssets = balanceSheet?.currentAssets ?? null;
  const totalLiabilities = balanceSheet?.totalLiabilities ?? null;
  const reportDate = balanceSheet?.reportDate ?? null;
  // 2026-09-27 特別股扣發行價（清償時特別股股東拿回的金額，Graham NCAV 本來就是扣清算價值），不是面額；使用者拍板。
  // 發行價的扣除額由股數 port 算（domain/financials/outstandingCommonShares.ts preferredClaimThousands），查不到股數時退回資產負債表的面額。
  const preferredClaim = balanceSheet?.preferredStockCapital && reportDate ? (await deps.shares.getOutstandingCommonShares(symbol, reportDate))?.preferredClaimThousands : undefined;
  const preferredStockCapital = preferredClaim ?? balanceSheet?.preferredStockCapital ?? 0n;

  const netCurrentAssetValueInThousands = currentAssets !== null && totalLiabilities !== null ? currentAssets - totalLiabilities - preferredStockCapital : null;
  const ncav = netCurrentAssetValueInThousands !== null ? toTotalValue(netCurrentAssetValueInThousands) : null;
  const nullReason: MetricNullReason | null = ncav === null ? 'missing_input' : null;

  return { symbol, year, season, rocYear, seasonNum, fiscalYear, reportDate, balanceSheet, currentAssets, totalLiabilities, preferredClaim, preferredStockCapital, ncav, nullReason };
};

export const computeNcav = async (query: QuarterlyMetricQuery, deps: NcavDeps): Promise<NcavComputationBatch> => {
  const { dataType, subsidiaryCompanyId } = query;
  const resolution = await resolveNcavInputs(query, deps);

  if (!resolution) {
    return noQuarterBatch(query.symbol, ['q']);
  }

  const { symbol, year, season, rocYear, seasonNum, fiscalYear, reportDate, ncav, nullReason } = resolution;

  const mainAnchor = await resolveKnowledgeDate(symbol, [{ rocYear, season: seasonNum, reportDate }], deps.announcements);

  let q: ComputationSlot;
  if (!mainAnchor) {
    q = { action: 'skipped_no_knowledge_date' };
  } else {
    q = computation({
      symbol,
      metricCode: 'ncav',
      fiscalYear,
      fiscalQuarter: seasonNum,
      dataType,
      subsidiaryCompanyId,
      ...periodTypeGroup('Q'),
      value: ncav,
      nullReason,
      knowledgeDate: mainAnchor.knowledgeDate,
      knowledgeDateIsFallback: mainAnchor.isFallback,
    });
  }

  return { symbol, rocYear: year, season, slots: withFormulaVersion({ q }, NCAV_FORMULA_VERSION) };
};
