import { resolveQuarterOrLatest } from '@/application/financials/latestQuarter';
import { toRatio4 } from '@/domain/metrics/shared/numericHelpers';
import { pickEquity } from '@/domain/metrics/shared/pickers';
import { rocYearToGregorian, type Season } from '@/domain/calendar/rocQuarter';
import type { QuarterlyMetricQuery } from '@/domain/financials/quarterlyMetric';
import { resolveKnowledgeDate } from '../../knowledgeDate';
import type { MetricNullReason } from '../../../../domain/metrics/metricBasis';
import { periodTypeGroup } from '@/domain/metrics/coordinate';
import { computation, type ComputationBatch, type ComputationSlot, noQuarterBatch } from '@/domain/metrics/computation';
import type { PitDeps } from '@/application/metrics/deps';
import { resolveTrailingIncomeStatements } from '@/application/metrics/shared/trailingYear';

// Altman Z″-Score（1983/1995，非製造業/新興市場版）——四變數，刻意拿掉 X5（資產週轉率），
// 理由是原始論文認為週轉率在非製造業/新興市場產業間差異太大，會扭曲跨產業比較，跟
// altmanZScore（1968 原版五變數）/altmanZPrimeScore（1983 非上市版五變數）是三個各自
// 發表、獨立登錄的模型。X4 跟 Z′ 一樣用帳面權益（沒有市值可用時的版本，Z″ 論文延續 Z′
// 的這個設計，不是又換一次）。獨立重新計算，不依賴另外兩支已寫入的值。
// 2026-09-13：這個版本是「非製造業」設計的，製造業公司（財政部稅籍分類 section='C'，
// 2026-10-02 起改用交易所類股判斷，見下方 NON_MANUFACTURING_SECTOR_CODES）套用這個版本本身就不符合設計前提；金融保險業
// （twse-ts industry='17'）雖然也是非製造業，但銀行的資產負債表結構（存款/放款）本來
// 就不適用一般會計比率型危機模型，理由跟 altmanZScore/beneishMScore/ohlsonOScore/
// zmijewskiScore 排除金融業一致，兩個條件任一成立就排除。
// 2026-09-15 改版：原本排除時仍會寫一列 nullReason:'not_applicable_industry'，
// web-nuxt 抓到實測製造業佔 TWSE 上市公司 587/999（約59%）——對「多數公司永遠不適用」
// 這支變體寫入排除列，跟 bankCapitalAdequacy 排除非銀行公司同一種「不該存在」情境
// （見 evaluateCompanyBadges.ts 的「從未計算過」過濾邏輯，[[project_badge_hide_not_applicable]]），
// 改成在最前面直接 skip、完全不寫入任何一列，讓徽章清單自動把它濾掉，不再顯示成
// 永久性的「不適用」灰卡片。altmanZScore（原版，只排除金融業，覆蓋率遠高於此）維持
// 原本寫 not_applicable_industry 的行為不變，兩者排除比例差異很大，不是同一種情況。


// 2026-10-02 使用者拍板：製造業判斷從 gov-ts 財政部稅籍分類（只涵蓋上市 999 家，上櫃興櫃全缺；原本查不到就當非製造業照算，
// 上櫃興櫃的製造業也拿到 Z″）改成兩市統一用交易所類股，避免上市、上櫃兩套「非製造業」定義。哪些類股算非製造業：用上市公司兩套分類
// 的重疊量（tmp/sectorMfg.ts，每個類股的上市公司在稅籍分類屬製造業 C 的比例）——以下 9 個 0%～27%，名稱也明確是非製造業。
// 模糊的類股（生技醫療 50%、其他電子 49%、其他 42%、綠能環保 28%、運動休閒 67%、居家生活 63%、造紙 29%（多為控股公司）、
// 農業科技（無上市資料））使用者拍板一律不算（fail-closed，少算不錯算）；金融保險（17）排除理由見檔頭；類股查不到也不算。
// ponytail: 類股清單是寫死的，交易所新增類股時要回來判斷（新類股預設不算）。
const NON_MANUFACTURING_SECTOR_CODES = new Set([
  '14', // 建材營造業
  '15', // 航運業
  '16', // 觀光事業
  '18', // 貿易百貨
  '23', // 油電燃氣業
  '29', // 電子通路業
  '30', // 資訊服務業
  '32', // 文化創意業
  '36', // 數位雲端
]);

const isZDoublePrimeSector = async (deps: Pick<PitDeps, 'industry'>, symbol: string): Promise<boolean> => {
  const sector = await deps.industry.getSecuritiesSectorCode(symbol);
  return sector !== null && NON_MANUFACTURING_SECTOR_CODES.has(sector);
};

export type AltmanZDoublePrimeScoreDeps = Pick<PitDeps, 'statements' | 'quarters' | 'announcements' | 'industry' | 'cumulativeStatements'>;

export type AltmanZDoublePrimeScoreComputationBatch = ComputationBatch<'ttm'>;

export const computeAltmanZDoublePrimeScore = async (query: QuarterlyMetricQuery, deps: AltmanZDoublePrimeScoreDeps): Promise<AltmanZDoublePrimeScoreComputationBatch> => {
  const { symbol, dataType, subsidiaryCompanyId } = query;

  if (!(await isZDoublePrimeSector(deps, symbol))) {
    return noQuarterBatch(symbol, ['ttm']);
  }

  const resolvedQuarter = await resolveQuarterOrLatest(query, ['balanceSheet', 'incomeStatement'], deps.quarters);

  if (!resolvedQuarter) {
    return noQuarterBatch(symbol, ['ttm']);
  }

  const { year, season } = resolvedQuarter;
  const rocYear = Number(year);
  const seasonNum = Number(season);
  const fiscalYear = rocYearToGregorian(rocYear);

  const key = { symbol, year: rocYear, quarter: seasonNum, dataType, subsidiaryCompanyId };
  const balanceSheet = await deps.statements.getBalanceSheet(key);
  const totalAssets = balanceSheet?.totalAssets ?? null;
  const totalLiabilities = balanceSheet?.totalLiabilities ?? null;
  const currentAssets = balanceSheet?.currentAssets ?? null;
  const currentLiabilities = balanceSheet?.currentLiabilities ?? null;
  const retainedEarnings = balanceSheet?.retainedEarnings ?? null;
  const bookEquity = pickEquity(balanceSheet).value;
  const reportDate = balanceSheet?.reportDate ?? null;

  const x1 = currentAssets !== null && currentLiabilities !== null && totalAssets !== null ? toRatio4(currentAssets - currentLiabilities, totalAssets) : null;
  const x2 = retainedEarnings !== null && totalAssets !== null ? toRatio4(retainedEarnings, totalAssets) : null;
  const x4 = bookEquity !== null && totalLiabilities !== null && totalLiabilities !== 0n ? toRatio4(bookEquity, totalLiabilities) : null;

  const mainAnchor = await resolveKnowledgeDate(symbol, [{ rocYear, season: seasonNum, reportDate }], deps.announcements);

  // X3：近四季（含本季）EBIT 加總，分母固定用本季期末總資產——跟 Z/Z′ 一樣需要 TTM，
  // 但 Z″ 沒有 X5，不用查營收。
  // 2026-10-01 近一年改走共用來源（興櫃半年頻，見 shared/trailingYear.ts）。
  const trailing = await resolveTrailingIncomeStatements({ symbol, rocYear, season: season as Season, dataType, subsidiaryCompanyId }, deps);
  const ttmQuarters = trailing.periods;
  const ttmRecords = trailing.periods.map((p) => p.record);

  let ebitTtmSum = 0n;
  let ttmComplete = true;
  for (const record of ttmRecords) {
    if (record === null || record.profitBeforeTax === null || record.financeCosts === null) {
      ttmComplete = false;
    } else {
      ebitTtmSum += record.profitBeforeTax + record.financeCosts;
    }
  }

  const x3 = ttmComplete && totalAssets !== null ? toRatio4(ebitTtmSum, totalAssets) : null;

  const zDoublePrimeScore =
    x1 !== null && x2 !== null && x3 !== null && x4 !== null ? Math.round((6.56 * x1 + 3.26 * x2 + 6.72 * x3 + 1.05 * x4) * 100) / 100 : null;

  let nullReason: MetricNullReason | null = null;
  if (zDoublePrimeScore === null) {
    nullReason = !ttmComplete ? 'insufficient_history' : 'missing_input';
  }

  const coordinateBase = { symbol, metricCode: 'altmanZDoublePrimeScore', fiscalYear, fiscalQuarter: seasonNum, dataType, subsidiaryCompanyId };

  let ttm: ComputationSlot;
  if (!mainAnchor) {
    ttm = { action: 'skipped_no_knowledge_date' };
  } else if (ttmComplete) {
    const ttmAnchor = await resolveKnowledgeDate(
      symbol,
      ttmQuarters.map((tq, i) => ({ rocYear: Number(tq.year), season: Number(tq.season), reportDate: ttmRecords[i]?.reportDate ?? null })), deps.announcements
    );
    if (!ttmAnchor) {
      ttm = { action: 'skipped_no_knowledge_date' };
    } else {
      ttm = computation({
        ...coordinateBase,
        ...periodTypeGroup('TTM'),
        value: zDoublePrimeScore,
        nullReason,
        knowledgeDate: ttmAnchor.knowledgeDate,
        knowledgeDateIsFallback: ttmAnchor.isFallback,
      });
    }
  } else {
    ttm = computation({
      ...coordinateBase,
      ...periodTypeGroup('TTM'),
      value: null,
      // 沿用上面算好的 nullReason（insufficient_history/missing_input），不要重新
      // 硬寫死。製造業/金融業已經在函式最前面直接 skip，不會走到這裡。
      nullReason,
      knowledgeDate: mainAnchor.knowledgeDate,
      knowledgeDateIsFallback: mainAnchor.isFallback,
    });
  }

  return { symbol, rocYear: year, season, slots: { ttm } };
};
