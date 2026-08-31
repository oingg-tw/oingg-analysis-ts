import prisma from '@/adapters/prisma/index';
import { analysisPrisma } from '@/adapters/prisma/analysisClient';
import { getPastNQuarters } from '@/shared/rocQuarter';
import { getLatestAvailableQuarter } from '@/shared/sourceData/latestQuarter';
import type { AccrualsRatioQuery, AccrualsRatioResult } from './types';

// 淨利欄位選擇邏輯跟 ROE/EPS 一致：優先採用「歸屬於母公司」口徑，缺漏時退回用整體數字。
const pickNetIncome = (
  record: { netIncomeAttributableToParent: bigint | null; netIncome: bigint | null } | null
): { field: 'netIncomeAttributableToParent' | 'netIncome' | null; value: bigint | null } => {
  if (!record) return { field: null, value: null };
  if (record.netIncomeAttributableToParent !== null) return { field: 'netIncomeAttributableToParent', value: record.netIncomeAttributableToParent };
  if (record.netIncome !== null) return { field: 'netIncome', value: record.netIncome };
  return { field: null, value: null };
};

const toPct = (numerator: bigint, denominator: bigint): number | null => {
  if (denominator === 0n) return null;
  return Math.round((Number(numerator) / Number(denominator)) * 100 * 100) / 100; // 四捨五入到小數 2 位
};

const emptyResult = (companyId: string, dataType: '1' | '2', subsidiaryCompanyId: string, warnings: string[]): AccrualsRatioResult => ({
  companyId,
  year: null,
  season: null,
  dataType,
  subsidiaryCompanyId,
  reportDate: null,
  accrualsRatioQuarterly: null,
  accrualsRatioQuarterlyAnnualized: null,
  accrualsRatioTtm: null,
  netIncome: { fieldUsed: null, value: null },
  netIncomeTtm: { value: null },
  operatingCashFlow: { value: null },
  operatingCashFlowTtm: { value: null },
  investingCashFlow: { value: null },
  investingCashFlowTtm: { value: null },
  totalAssets: { value: null },
  ttm: { quartersUsed: [], quartersMissing: [] },
  warnings,
});

export const calculateAccrualsRatio = async (query: AccrualsRatioQuery): Promise<AccrualsRatioResult> => {
  const { companyId, dataType, subsidiaryCompanyId } = query;
  const warnings: string[] = [];

  // year/season 沒指定時，自動抓「這家公司資產負債表/損益表/現金流量表都有資料」的最新一季——不同公司
  // 財報申報進度不同步，見 shared/sourceData/latestQuarter.ts。
  const resolvedQuarter =
    query.year !== undefined && query.season !== undefined
      ? { year: query.year, season: query.season }
      : await getLatestAvailableQuarter(companyId, dataType, subsidiaryCompanyId, ['balanceSheet', 'incomeStatement', 'cashFlowStatement']);
  if (!resolvedQuarter) {
    return emptyResult(companyId, dataType, subsidiaryCompanyId, ['查無任何一季資產負債表/損益表/現金流量表都有資料的季度，無法決定要用哪一季計算應計項目比率。']);
  }
  const { year, season } = resolvedQuarter;
  const yearNum = Number(year);
  const seasonNum = Number(season);

  const where = {
    symbol_year_quarter_dataType_subsidiaryCompanyId: { symbol: companyId, year: yearNum, quarter: seasonNum, dataType, subsidiaryCompanyId },
  };

  const [balanceSheet, currentIncomeStatement, currentCashFlow] = await Promise.all([
    prisma.quarterlyBalanceSheet.findUnique({ where }),
    prisma.quarterlyIncomeStatement.findUnique({ where }),
    prisma.quarterlyCashFlowStatement.findUnique({ where }),
  ]);

  if (!balanceSheet) warnings.push('查無該季資產負債表資料。');
  if (!currentIncomeStatement) warnings.push('查無該季損益表資料。');
  if (!currentCashFlow) warnings.push('查無該季現金流量表資料。');

  const totalAssets = balanceSheet?.totalAssets ?? null;
  const netIncome = pickNetIncome(currentIncomeStatement);
  const operatingCashFlow = currentCashFlow?.netCashFromOperatingActivities ?? null;
  const investingCashFlow = currentCashFlow?.netCashFromInvestingActivities ?? null;
  if (currentIncomeStatement && netIncome.value === null) warnings.push('該季損益表淨利相關欄位皆為 null，無法計算。');
  if (currentCashFlow && operatingCashFlow === null) warnings.push('該季現金流量表營業活動現金流量欄位為 null，無法計算。');
  if (currentCashFlow && investingCashFlow === null) warnings.push('該季現金流量表投資活動現金流量欄位為 null，無法計算。');

  let accrualsRatioQuarterly: number | null = null;
  let accrualsRatioQuarterlyAnnualized: number | null = null;
  if (netIncome.value !== null && operatingCashFlow !== null && investingCashFlow !== null && totalAssets !== null) {
    const accrualsQuarterly = netIncome.value - operatingCashFlow - investingCashFlow;
    accrualsRatioQuarterly = toPct(accrualsQuarterly, totalAssets);
    if (accrualsRatioQuarterly !== null) accrualsRatioQuarterlyAnnualized = Math.round(accrualsRatioQuarterly * 4 * 100) / 100;
    if (totalAssets <= 0n) warnings.push('本季期末總資產為零或負數，應計項目比率數值意義有限，請自行判斷是否採用。');
  }

  // TTM：近四季（含本季）淨利、OCF、ICF 各自加總，分母固定用本季期末總資產（不是平均）。
  // 一季只要淨利、OCF、ICF 任一缺漏就視為該季不齊，三個共用同一組完整性判斷。
  const ttmQuarters = getPastNQuarters({ rocYear: yearNum, season }, 4);
  const [ttmIncomeRecords, ttmCashFlowRecords] = await Promise.all([
    Promise.all(
      ttmQuarters.map((q) =>
        prisma.quarterlyIncomeStatement.findUnique({
          where: {
            symbol_year_quarter_dataType_subsidiaryCompanyId: {
              symbol: companyId,
              year: Number(q.year),
              quarter: Number(q.season),
              dataType,
              subsidiaryCompanyId,
            },
          },
        })
      )
    ),
    Promise.all(
      ttmQuarters.map((q) =>
        prisma.quarterlyCashFlowStatement.findUnique({
          where: {
            symbol_year_quarter_dataType_subsidiaryCompanyId: {
              symbol: companyId,
              year: Number(q.year),
              quarter: Number(q.season),
              dataType,
              subsidiaryCompanyId,
            },
          },
        })
      )
    ),
  ]);

  const quartersUsed: string[] = [];
  const quartersMissing: string[] = [];
  let netIncomeTtmSum = 0n;
  let ocfTtmSum = 0n;
  let icfTtmSum = 0n;
  let ttmComplete = true;
  ttmQuarters.forEach((q, i) => {
    const label = `${q.year}Q${q.season}`;
    const picked = pickNetIncome(ttmIncomeRecords[i]!);
    const cashFlowRecord = ttmCashFlowRecords[i]!;
    if (
      picked.value === null ||
      cashFlowRecord === null ||
      cashFlowRecord.netCashFromOperatingActivities === null ||
      cashFlowRecord.netCashFromInvestingActivities === null
    ) {
      quartersMissing.push(label);
      ttmComplete = false;
    } else {
      quartersUsed.push(label);
      netIncomeTtmSum += picked.value;
      ocfTtmSum += cashFlowRecord.netCashFromOperatingActivities;
      icfTtmSum += cashFlowRecord.netCashFromInvestingActivities;
    }
  });
  if (!ttmComplete) warnings.push(`近四季資料不齊（缺: ${quartersMissing.join(', ')}），無法計算 TTM 應計項目比率。`);

  const netIncomeTtmValue = ttmComplete ? netIncomeTtmSum : null;
  const operatingCashFlowTtmValue = ttmComplete ? ocfTtmSum : null;
  const investingCashFlowTtmValue = ttmComplete ? icfTtmSum : null;

  let accrualsRatioTtm: number | null = null;
  if (netIncomeTtmValue !== null && operatingCashFlowTtmValue !== null && investingCashFlowTtmValue !== null && totalAssets !== null) {
    const accrualsTtm = netIncomeTtmValue - operatingCashFlowTtmValue - investingCashFlowTtmValue;
    accrualsRatioTtm = toPct(accrualsTtm, totalAssets);
  }

  const reportDate = balanceSheet?.reportDate ?? currentIncomeStatement?.reportDate ?? currentCashFlow?.reportDate ?? null;

  // 存進 oingg-analysis DB 的 cash_flow_accruals_ratio，供之後查歷史紀錄用。存檔失敗不應該讓已經算好的結果回傳失敗。
  try {
    await analysisPrisma.accrualsRatioResult.upsert({
      where: {
        symbol_year_season_dataType_subsidiaryCompanyId: { symbol: companyId, year: yearNum, season: seasonNum, dataType, subsidiaryCompanyId },
      },
      create: {
        symbol: companyId,
        year: yearNum,
        season: seasonNum,
        dataType,
        subsidiaryCompanyId,
        reportDate,
        accrualsRatioQuarterly,
        accrualsRatioQuarterlyAnnualized,
        accrualsRatioTtm,
        netIncomeFieldUsed: netIncome.field,
        netIncomeValue: netIncome.value,
        netIncomeTtmValue,
        operatingCashFlowValue: operatingCashFlow,
        operatingCashFlowTtmValue,
        investingCashFlowValue: investingCashFlow,
        investingCashFlowTtmValue,
        totalAssetsValue: totalAssets,
        warnings,
      },
      update: {
        reportDate,
        accrualsRatioQuarterly,
        accrualsRatioQuarterlyAnnualized,
        accrualsRatioTtm,
        netIncomeFieldUsed: netIncome.field,
        netIncomeValue: netIncome.value,
        netIncomeTtmValue,
        operatingCashFlowValue: operatingCashFlow,
        operatingCashFlowTtmValue,
        investingCashFlowValue: investingCashFlow,
        investingCashFlowTtmValue,
        totalAssetsValue: totalAssets,
        warnings,
      },
    });
  } catch (error) {
    console.error('[accruals-ratio]: 寫入 cash_flow_accruals_ratio 失敗，不影響本次回傳結果。', error);
  }

  return {
    companyId,
    year,
    season,
    dataType,
    subsidiaryCompanyId,
    reportDate: reportDate?.toISOString().slice(0, 10) ?? null,
    accrualsRatioQuarterly,
    accrualsRatioQuarterlyAnnualized,
    accrualsRatioTtm,
    netIncome: { fieldUsed: netIncome.field, value: netIncome.value?.toString() ?? null },
    netIncomeTtm: { value: netIncomeTtmValue?.toString() ?? null },
    operatingCashFlow: { value: operatingCashFlow?.toString() ?? null },
    operatingCashFlowTtm: { value: operatingCashFlowTtmValue?.toString() ?? null },
    investingCashFlow: { value: investingCashFlow?.toString() ?? null },
    investingCashFlowTtm: { value: investingCashFlowTtmValue?.toString() ?? null },
    totalAssets: { value: totalAssets?.toString() ?? null },
    ttm: { quartersUsed, quartersMissing },
    warnings,
  };
};
