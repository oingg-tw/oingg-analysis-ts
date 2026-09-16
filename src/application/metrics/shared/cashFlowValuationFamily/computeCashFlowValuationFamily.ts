import { resolveQuarterOrLatest } from '@/application/financials/latestQuarter';
import { toMultipleFromThousands } from '@/domain/metrics/shared/numericHelpers';
import { getPastNQuarters, rocYearToGregorian, type Season } from '@/domain/calendar/rocQuarter';
import type { QuarterlyMetricQuery } from '@/domain/financials/quarterlyMetric';
import { resolveKnowledgeDate } from '../../knowledgeDate';
import type { MetricNullReason } from '../../../../domain/metrics/metricBasis';
import { periodTypeGroup } from '@/domain/metrics/coordinate';
import { computation, type ComputationBatch, type ComputationSlot } from '@/domain/metrics/computation';
import type { PitDeps } from '@/application/metrics/deps';

// 2026-09-11 應使用者要求新增（「全市場六季財報深度解鎖的指標」批次）——一次查詢
// 資產負債表+損益表+現金流量表，算出 OCF(TTM)/FCF(TTM)/EnterpriseValue/InvestedCapital
// 四個中繼變量，拆出 8 個 TTM-only metricCode。只有 TTM 一種 basis（跟這批全部指標的
// 精神一致：需要 4 季但不用跨 3 年以上，6 季全市場深度剛好夠用）。
//
// EnterpriseValue 沿用 evEbitda/computeEvEbitdaPit.ts 的既有邏輯（netDebt=
// (shortTermBorrowings+bondsPayable+longTermBorrowings)-cash、EV=marketCap+netDebt*1000），
// InvestedCapital 沿用 roic/computeRoicPit.ts 的既有邏輯（totalDebt+equity-cash）——
// 兩者都不抽共用函式，比照本 repo「每個檔案各自重複定義 EV/EBIT」的既有慣例
// （見 evEbitda 檔頭說明：interestCoverage/netDebtToEbitda/roic/roce 四個檔案各自
// 重複定義 EBIT，同一種模式）。
//
// FCF = OCF + capitalExpenditures（capex 本身是 XBRL 投資活動現金流出的負數，跟
// pFcf/fcfYield 既有慣例完全一致，不用另外取絕對值相減）。capexToOcfRatio 展示給
// 使用者的是正的比率，內部才取絕對值。
//
// fcfConversionRate 採用 FCF(TTM)/NetIncome(TTM) 這個定義（衡量帳面獲利有多少比例
// 真的轉換成自由現金流），不是 FCF/OCF 或 FCF/EBITDA 版本——業界對「conversion rate」
// 有多種定義，這裡明確記錄採用的是哪一種。

const toPctFromThousands = (numeratorInThousands: bigint, denominatorInThousands: bigint): number | null => {
  if (denominatorInThousands === 0n) return null;
  return Math.round((Number(numeratorInThousands) / Number(denominatorInThousands)) * 100 * 100) / 100;
};

const toRatioFromThousands = (numeratorInThousands: bigint, denominatorInThousands: bigint): number | null => {
  if (denominatorInThousands === 0n) return null;
  return Math.round((Number(numeratorInThousands) / Number(denominatorInThousands)) * 100) / 100;
};


export type CashFlowValuationFamilyDeps = Pick<PitDeps, 'statements' | 'quarters' | 'announcements' | 'market'>;

export type CashFlowValuationFamilyComputationBatch = ComputationBatch<'evToOcf' | 'evToSales' | 'priceToOcf' | 'debtToFcf' | 'capexToOcfRatio' | 'croic' | 'ocfMargin' | 'fcfConversionRate'>;

export const computeCashFlowValuationFamily = async (
  query: QuarterlyMetricQuery,
  deps: CashFlowValuationFamilyDeps
): Promise<CashFlowValuationFamilyComputationBatch> => {
  const { symbol, dataType, subsidiaryCompanyId } = query;

  const skipped = (action: 'skipped_no_quarter'): CashFlowValuationFamilyComputationBatch => ({
    symbol,
    rocYear: null,
    season: null,
    slots: {
      evToOcf: { action },
      evToSales: { action },
      priceToOcf: { action },
      debtToFcf: { action },
      capexToOcfRatio: { action },
      croic: { action },
      ocfMargin: { action },
      fcfConversionRate: { action },
    },
  });

  const resolvedQuarter = await resolveQuarterOrLatest(query, ['balanceSheet', 'incomeStatement', 'cashFlowStatement'], deps.quarters);

  if (!resolvedQuarter) return skipped('skipped_no_quarter');

  const { year, season } = resolvedQuarter;
  const rocYear = Number(year);
  const seasonNum = Number(season);
  const fiscalYear = rocYearToGregorian(rocYear);

  const key = { symbol, year: rocYear, quarter: seasonNum, dataType, subsidiaryCompanyId };
  const [balanceSheet, incomeStatement, cashFlowStatement] = await Promise.all([
    deps.statements.getBalanceSheet(key),
    deps.statements.getIncomeStatement(key),
    deps.statements.getCashFlowStatement(key),
  ]);

  const totalDebt = balanceSheet
    ? (balanceSheet.shortTermBorrowings ?? 0n) + (balanceSheet.bondsPayable ?? 0n) + (balanceSheet.longTermBorrowings ?? 0n)
    : null;
  const cashAndEquivalents = balanceSheet?.cashAndEquivalents ?? null;
  const netDebt = totalDebt !== null && cashAndEquivalents !== null ? totalDebt - cashAndEquivalents : null;
  const equity = balanceSheet?.equityAttributableToParent ?? balanceSheet?.totalEquity ?? null;
  const investedCapital = totalDebt !== null && equity !== null && cashAndEquivalents !== null ? totalDebt + equity - cashAndEquivalents : null;

  const reportDate = balanceSheet?.reportDate ?? incomeStatement?.reportDate ?? cashFlowStatement?.reportDate ?? null;
  const mainAnchor = await resolveKnowledgeDate(symbol, [{ rocYear, season: seasonNum, reportDate }], deps.announcements);
  const marketCap = mainAnchor ? await deps.market.getMarketCap(symbol, mainAnchor.knowledgeDate) : null;
  const enterpriseValue = marketCap !== null && netDebt !== null ? marketCap.marketCap + Number(netDebt) * 1000 : null;

  // TTM：近四季（含本季）OCF/Capex/Revenue/NetIncome 各自加總；EV/InvestedCapital
  // 沿用上面同一筆，不另外重查（跟 evEbitda 的做法一致）。
  const ttmQuarters = getPastNQuarters({ rocYear, season: season as Season }, 4);
  const ttmRecords = await Promise.all(
    ttmQuarters.map((tq) =>
      Promise.all([
        deps.statements.getIncomeStatement({ symbol, year: Number(tq.year), quarter: Number(tq.season), dataType, subsidiaryCompanyId }),
        deps.statements.getCashFlowStatement({ symbol, year: Number(tq.year), quarter: Number(tq.season), dataType, subsidiaryCompanyId }),
      ])
    )
  );

  let ocfTtmSum = 0n;
  let capexTtmSum = 0n;
  let revenueTtmSum = 0n;
  let netIncomeTtmSum = 0n;
  let ttmComplete = true;
  for (const [incomeRecord, cashFlowRecord] of ttmRecords) {
    if (
      incomeRecord === null ||
      cashFlowRecord === null ||
      incomeRecord.operatingRevenue === null ||
      incomeRecord.netIncome === null ||
      cashFlowRecord.netCashFromOperatingActivities === null ||
      cashFlowRecord.capitalExpenditures === null
    ) {
      ttmComplete = false;
    } else {
      ocfTtmSum += cashFlowRecord.netCashFromOperatingActivities;
      capexTtmSum += cashFlowRecord.capitalExpenditures;
      revenueTtmSum += incomeRecord.operatingRevenue;
      netIncomeTtmSum += incomeRecord.netIncome;
    }
  }
  const fcfTtmSum = ocfTtmSum + capexTtmSum; // capex 是負數，加總即為扣除。

  const coordinateBase = { symbol, metricCode: '', fiscalYear, fiscalQuarter: seasonNum, dataType, subsidiaryCompanyId };
  const coordinateFor = (metricCode: string) => ({ ...coordinateBase, metricCode });

  if (!ttmComplete) {
    if (!mainAnchor) return skipped('skipped_no_quarter');
    const { knowledgeDate, isFallback: knowledgeDateIsFallback } = mainAnchor;
    const insufficientHistory = (metricCode: string): ComputationSlot =>
      computation({ ...coordinateFor(metricCode), ...periodTypeGroup('TTM'), value: null, nullReason: 'insufficient_history', knowledgeDate, knowledgeDateIsFallback });

    return {
      symbol,
      rocYear: year,
      season,
      slots: {
        evToOcf: insufficientHistory('evToOcf'),
        evToSales: insufficientHistory('evToSales'),
        priceToOcf: insufficientHistory('priceToOcf'),
        debtToFcf: insufficientHistory('debtToFcf'),
        capexToOcfRatio: insufficientHistory('capexToOcfRatio'),
        croic: insufficientHistory('croic'),
        ocfMargin: insufficientHistory('ocfMargin'),
        fcfConversionRate: insufficientHistory('fcfConversionRate'),
      },
    };
  }

  if (!mainAnchor) return skipped('skipped_no_quarter');

  const ttmAnchor = await resolveKnowledgeDate(
    symbol,
    ttmQuarters.map((tq, i) => ({ rocYear: Number(tq.year), season: Number(tq.season), reportDate: ttmRecords[i]![0]?.reportDate ?? null })), deps.announcements
  );
  if (!ttmAnchor) return skipped('skipped_no_quarter');
  const { knowledgeDate, isFallback: knowledgeDateIsFallback } = ttmAnchor;

  const evToOcfValue = enterpriseValue !== null ? toMultipleFromThousands(enterpriseValue, ocfTtmSum) : null;
  const evToSalesValue = enterpriseValue !== null ? toMultipleFromThousands(enterpriseValue, revenueTtmSum) : null;
  const priceToOcfValue = marketCap !== null ? toMultipleFromThousands(marketCap.marketCap, ocfTtmSum) : null;
  const debtToFcfValue = totalDebt !== null ? toRatioFromThousands(totalDebt, fcfTtmSum) : null;
  const capexToOcfRatioValue = toPctFromThousands(capexTtmSum < 0n ? -capexTtmSum : capexTtmSum, ocfTtmSum);
  const croicValue = investedCapital !== null ? toRatioFromThousands(fcfTtmSum, investedCapital) : null;
  const ocfMarginValue = toPctFromThousands(ocfTtmSum, revenueTtmSum);
  const fcfConversionRateValue = toPctFromThousands(fcfTtmSum, netIncomeTtmSum);

  const nullReasonFor = (value: number | null, ...inputsAvailable: boolean[]): MetricNullReason | null => {
    if (value !== null) return null;
    return inputsAvailable.every(Boolean) ? 'zero_or_negative_denominator' : 'missing_input';
  };

  const write = (metricCode: string, value: number | null, nullReason: MetricNullReason | null): ComputationSlot =>
    computation({ ...coordinateFor(metricCode), ...periodTypeGroup('TTM'), value, nullReason, knowledgeDate, knowledgeDateIsFallback });

  const evToOcf = write('evToOcf', evToOcfValue, nullReasonFor(evToOcfValue, enterpriseValue !== null));
  const evToSales = write('evToSales', evToSalesValue, nullReasonFor(evToSalesValue, enterpriseValue !== null));
  const priceToOcf = write('priceToOcf', priceToOcfValue, nullReasonFor(priceToOcfValue, marketCap !== null));
  const debtToFcf = write('debtToFcf', debtToFcfValue, nullReasonFor(debtToFcfValue, totalDebt !== null));
  const capexToOcfRatio = write('capexToOcfRatio', capexToOcfRatioValue, nullReasonFor(capexToOcfRatioValue, true));
  const croic = write('croic', croicValue, nullReasonFor(croicValue, investedCapital !== null));
  const ocfMargin = write('ocfMargin', ocfMarginValue, nullReasonFor(ocfMarginValue, true));
  const fcfConversionRate = write('fcfConversionRate', fcfConversionRateValue, nullReasonFor(fcfConversionRateValue, true));

  return { symbol, rocYear: year, season, slots: { evToOcf, evToSales, priceToOcf, capexToOcfRatio, debtToFcf, croic, ocfMargin, fcfConversionRate } };
};
