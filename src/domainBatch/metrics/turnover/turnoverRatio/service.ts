import { analysisPrisma } from '@/adapters/prisma/analysisClient';
import { buildFieldStatuses, type MetricStatus } from '@/shared/metricStatus';
import { getPastNQuarters } from '@/shared/rocQuarter';
import { getLatestAvailableQuarter } from '@/shared/sourceData/latestQuarter';
import { getQuarterlyBalanceSheet, getQuarterlyIncomeStatement } from '@/shared/sourceData/mopsQuarterlyStatements';
import type { TurnoverRatioQuery, TurnoverRatioResult } from './types';

// 周轉率用期末餘額（存貨、應收帳款、應付帳款、總資產），不是期初期末平均——跟 ROE 用期末權益一樣的刻意簡化。
const toTurnover = (numerator: bigint, denominator: bigint): number | null => {
  if (denominator === 0n) return null;
  return Math.round((Number(numerator) / Number(denominator)) * 100) / 100; // 四捨五入到小數 2 位，單位是「次」
};

// DIO/DSO/DPO = 365 / 年化周轉率。周轉率為 0（分子營業成本/營收剛好是 0）時無法換算天數，回傳 null。
const toDays = (annualizedTurnover: number | null): number | null => {
  if (annualizedTurnover === null || annualizedTurnover === 0) return null;
  return Math.round((365 / annualizedTurnover) * 100) / 100;
};

const emptyResult = (symbol: string, dataType: '1' | '2', subsidiaryCompanyId: string, warnings: string[]): TurnoverRatioResult => ({
  symbol,
  year: null,
  season: null,
  dataType,
  subsidiaryCompanyId,
  reportDate: null,
  inventoryTurnoverQuarterly: null,
  inventoryTurnoverQuarterlyAnnualized: null,
  inventoryTurnoverTtm: null,
  receivablesTurnoverQuarterly: null,
  receivablesTurnoverQuarterlyAnnualized: null,
  receivablesTurnoverTtm: null,
  assetTurnoverQuarterly: null,
  assetTurnoverQuarterlyAnnualized: null,
  assetTurnoverTtm: null,
  fixedAssetTurnoverQuarterly: null,
  fixedAssetTurnoverQuarterlyAnnualized: null,
  fixedAssetTurnoverTtm: null,
  payablesTurnoverQuarterly: null,
  payablesTurnoverQuarterlyAnnualized: null,
  payablesTurnoverTtm: null,
  inventoryDaysQuarterlyAnnualized: null,
  inventoryDaysTtm: null,
  receivablesDaysQuarterlyAnnualized: null,
  receivablesDaysTtm: null,
  payablesDaysQuarterlyAnnualized: null,
  payablesDaysTtm: null,
  cashConversionCycleQuarterlyAnnualized: null,
  cashConversionCycleTtm: null,
  operatingCost: { value: null },
  operatingCostTtm: { value: null },
  operatingRevenue: { value: null },
  operatingRevenueTtm: { value: null },
  inventory: { value: null },
  accountsReceivable: { value: null },
  totalAssets: { value: null },
  propertyPlantEquipment: { value: null },
  accountsPayable: { value: null },
  ttm: { quartersUsed: [], quartersMissing: [] },
  fieldStatuses: {},
  warnings,
});

export const calculateTurnoverRatio = async (query: TurnoverRatioQuery): Promise<TurnoverRatioResult> => {
  const { symbol, dataType, subsidiaryCompanyId } = query;
  const warnings: string[] = [];

  // year/season 沒指定時，自動抓「這家公司資產負債表跟損益表都有資料」的最新一季——不同公司財報申報
  // 進度不同步，見 shared/sourceData/latestQuarter.ts。
  const resolvedQuarter =
    query.year !== undefined && query.season !== undefined
      ? { year: query.year, season: query.season }
      : await getLatestAvailableQuarter(symbol, dataType, subsidiaryCompanyId, ['balanceSheet', 'incomeStatement']);
  if (!resolvedQuarter) {
    return emptyResult(symbol, dataType, subsidiaryCompanyId, ['查無任何一季資產負債表/損益表都有資料的季度，無法決定要用哪一季計算周轉率。']);
  }
  const { year, season } = resolvedQuarter;
  const yearNum = Number(year);
  const seasonNum = Number(season);

  const key = { symbol: symbol, year: yearNum, quarter: seasonNum, dataType, subsidiaryCompanyId };

  const [balanceSheet, currentIncomeStatement] = await Promise.all([
    getQuarterlyBalanceSheet(key),
    getQuarterlyIncomeStatement(key),
  ]);

  if (!balanceSheet) warnings.push('查無該季資產負債表資料。');
  if (!currentIncomeStatement) warnings.push('查無該季損益表資料。');

  const inventory = balanceSheet?.inventory ?? null;
  const accountsReceivable = balanceSheet?.accountsReceivable ?? null;
  const totalAssets = balanceSheet?.totalAssets ?? null;
  const propertyPlantEquipment = balanceSheet?.propertyPlantEquipment ?? null;
  const accountsPayable = balanceSheet?.accountsPayable ?? null;
  const operatingCost = currentIncomeStatement?.operatingCost ?? null;
  const operatingRevenue = currentIncomeStatement?.operatingRevenue ?? null;

  // TTM：近四季（含本季）營業成本、營收各自加總。一季只要營業成本或營收任一為 null 就視為該季不齊，
  // 三個周轉率共用同一組「資料齊不齊」判斷，不分開追蹤三套缺季清單。
  const ttmQuarters = getPastNQuarters({ rocYear: yearNum, season }, 4);
  const ttmRecords = await Promise.all(
    ttmQuarters.map((q) =>
      getQuarterlyIncomeStatement({
        symbol: symbol,
        year: Number(q.year),
        quarter: Number(q.season),
        dataType,
        subsidiaryCompanyId,
      })
    )
  );

  const quartersUsed: string[] = [];
  const quartersMissing: string[] = [];
  let costTtmSum = 0n;
  let revenueTtmSum = 0n;
  let ttmComplete = true;
  ttmQuarters.forEach((q, i) => {
    const label = `${q.year}Q${q.season}`;
    const record = ttmRecords[i]!;
    if (record === null || record.operatingCost === null || record.operatingRevenue === null) {
      quartersMissing.push(label);
      ttmComplete = false;
    } else {
      quartersUsed.push(label);
      costTtmSum += record.operatingCost;
      revenueTtmSum += record.operatingRevenue;
    }
  });
  if (!ttmComplete) warnings.push(`近四季資料不齊（缺: ${quartersMissing.join(', ')}），無法計算 TTM 周轉率。`);

  let inventoryTurnoverQuarterly: number | null = null;
  let inventoryTurnoverQuarterlyAnnualized: number | null = null;
  let receivablesTurnoverQuarterly: number | null = null;
  let receivablesTurnoverQuarterlyAnnualized: number | null = null;
  let assetTurnoverQuarterly: number | null = null;
  let assetTurnoverQuarterlyAnnualized: number | null = null;
  let fixedAssetTurnoverQuarterly: number | null = null;
  let fixedAssetTurnoverQuarterlyAnnualized: number | null = null;
  let payablesTurnoverQuarterly: number | null = null;
  let payablesTurnoverQuarterlyAnnualized: number | null = null;

  if (operatingCost !== null && inventory !== null) {
    inventoryTurnoverQuarterly = toTurnover(operatingCost, inventory);
    if (inventoryTurnoverQuarterly !== null) inventoryTurnoverQuarterlyAnnualized = Math.round(inventoryTurnoverQuarterly * 4 * 100) / 100;
    if (inventory <= 0n) warnings.push('本季期末存貨為零或負數，存貨周轉率數值意義有限，請自行判斷是否採用。');
  }
  if (operatingRevenue !== null && accountsReceivable !== null) {
    receivablesTurnoverQuarterly = toTurnover(operatingRevenue, accountsReceivable);
    if (receivablesTurnoverQuarterly !== null) receivablesTurnoverQuarterlyAnnualized = Math.round(receivablesTurnoverQuarterly * 4 * 100) / 100;
    if (accountsReceivable <= 0n) warnings.push('本季期末應收帳款為零或負數，應收帳款周轉率數值意義有限，請自行判斷是否採用。');
  }
  if (operatingRevenue !== null && totalAssets !== null) {
    assetTurnoverQuarterly = toTurnover(operatingRevenue, totalAssets);
    if (assetTurnoverQuarterly !== null) assetTurnoverQuarterlyAnnualized = Math.round(assetTurnoverQuarterly * 4 * 100) / 100;
    if (totalAssets <= 0n) warnings.push('本季期末總資產為零或負數，總資產周轉率數值意義有限，請自行判斷是否採用。');
  }
  if (operatingRevenue !== null && propertyPlantEquipment !== null) {
    fixedAssetTurnoverQuarterly = toTurnover(operatingRevenue, propertyPlantEquipment);
    if (fixedAssetTurnoverQuarterly !== null) fixedAssetTurnoverQuarterlyAnnualized = Math.round(fixedAssetTurnoverQuarterly * 4 * 100) / 100;
    if (propertyPlantEquipment <= 0n) warnings.push('本季期末不動產、廠房及設備為零或負數，固定資產周轉率數值意義有限，請自行判斷是否採用。');
  }
  if (operatingCost !== null && accountsPayable !== null) {
    payablesTurnoverQuarterly = toTurnover(operatingCost, accountsPayable);
    if (payablesTurnoverQuarterly !== null) payablesTurnoverQuarterlyAnnualized = Math.round(payablesTurnoverQuarterly * 4 * 100) / 100;
    if (accountsPayable <= 0n) warnings.push('本季期末應付帳款為零或負數，應付帳款周轉率數值意義有限，請自行判斷是否採用。');
  }

  const operatingCostTtmValue = ttmComplete ? costTtmSum : null;
  const operatingRevenueTtmValue = ttmComplete ? revenueTtmSum : null;

  const inventoryTurnoverTtm = operatingCostTtmValue !== null && inventory !== null ? toTurnover(operatingCostTtmValue, inventory) : null;
  const receivablesTurnoverTtm =
    operatingRevenueTtmValue !== null && accountsReceivable !== null ? toTurnover(operatingRevenueTtmValue, accountsReceivable) : null;
  const assetTurnoverTtm = operatingRevenueTtmValue !== null && totalAssets !== null ? toTurnover(operatingRevenueTtmValue, totalAssets) : null;
  const fixedAssetTurnoverTtm =
    operatingRevenueTtmValue !== null && propertyPlantEquipment !== null ? toTurnover(operatingRevenueTtmValue, propertyPlantEquipment) : null;
  // 應付帳款周轉率 TTM 分子跟存貨周轉率 TTM 共用同一組營業成本加總（costTtmSum），不用再查一次。
  const payablesTurnoverTtm = operatingCostTtmValue !== null && accountsPayable !== null ? toTurnover(operatingCostTtmValue, accountsPayable) : null;

  // DIO/DSO/DPO 只提供年化跟 TTM 兩種口徑（原因見 types.ts 註解），CCC = DIO + DSO - DPO。
  const inventoryDaysQuarterlyAnnualized = toDays(inventoryTurnoverQuarterlyAnnualized);
  const inventoryDaysTtm = toDays(inventoryTurnoverTtm);
  const receivablesDaysQuarterlyAnnualized = toDays(receivablesTurnoverQuarterlyAnnualized);
  const receivablesDaysTtm = toDays(receivablesTurnoverTtm);
  const payablesDaysQuarterlyAnnualized = toDays(payablesTurnoverQuarterlyAnnualized);
  const payablesDaysTtm = toDays(payablesTurnoverTtm);

  const cashConversionCycleQuarterlyAnnualized =
    inventoryDaysQuarterlyAnnualized !== null && receivablesDaysQuarterlyAnnualized !== null && payablesDaysQuarterlyAnnualized !== null
      ? Math.round((inventoryDaysQuarterlyAnnualized + receivablesDaysQuarterlyAnnualized - payablesDaysQuarterlyAnnualized) * 100) / 100
      : null;
  const cashConversionCycleTtm =
    inventoryDaysTtm !== null && receivablesDaysTtm !== null && payablesDaysTtm !== null
      ? Math.round((inventoryDaysTtm + receivablesDaysTtm - payablesDaysTtm) * 100) / 100
      : null;

  const reportDate = balanceSheet?.reportDate ?? currentIncomeStatement?.reportDate ?? null;

  const fieldStatusEntries: Array<[string, MetricStatus] | null> = [
    inventoryTurnoverQuarterly === null
      ? ['inventoryTurnoverQuarterly', { status: 'no_data', message: '本季營業成本或期末存貨缺漏，無法計算存貨周轉率。' }]
      : null,
    inventoryTurnoverTtm === null
      ? ['inventoryTurnoverTtm', { status: 'no_data', message: '近四季資料不齊，或本季期末存貨缺漏，無法計算 TTM 存貨周轉率。' }]
      : null,
    receivablesTurnoverQuarterly === null
      ? ['receivablesTurnoverQuarterly', { status: 'no_data', message: '本季營收或期末應收帳款缺漏，無法計算應收帳款周轉率。' }]
      : null,
    receivablesTurnoverTtm === null
      ? ['receivablesTurnoverTtm', { status: 'no_data', message: '近四季資料不齊，或本季期末應收帳款缺漏，無法計算 TTM 應收帳款周轉率。' }]
      : null,
    assetTurnoverQuarterly === null
      ? ['assetTurnoverQuarterly', { status: 'no_data', message: '本季營收或期末總資產缺漏，無法計算總資產周轉率。' }]
      : null,
    assetTurnoverTtm === null
      ? ['assetTurnoverTtm', { status: 'no_data', message: '近四季資料不齊，或本季期末總資產缺漏，無法計算 TTM 總資產周轉率。' }]
      : null,
    fixedAssetTurnoverQuarterly === null
      ? ['fixedAssetTurnoverQuarterly', { status: 'no_data', message: '本季營收或期末不動產、廠房及設備缺漏，無法計算固定資產周轉率。' }]
      : null,
    fixedAssetTurnoverTtm === null
      ? ['fixedAssetTurnoverTtm', { status: 'no_data', message: '近四季資料不齊，或本季期末不動產、廠房及設備缺漏，無法計算 TTM 固定資產周轉率。' }]
      : null,
    payablesTurnoverQuarterly === null
      ? ['payablesTurnoverQuarterly', { status: 'no_data', message: '本季營業成本或期末應付帳款缺漏，無法計算應付帳款周轉率。' }]
      : null,
    payablesTurnoverTtm === null
      ? ['payablesTurnoverTtm', { status: 'no_data', message: '近四季資料不齊，或本季期末應付帳款缺漏，無法計算 TTM 應付帳款周轉率。' }]
      : null,
    inventoryDaysQuarterlyAnnualized === null
      ? ['inventoryDaysQuarterlyAnnualized', { status: 'no_data', message: '存貨周轉率（年化）無法計算或為零，無法換算 DIO 天數。' }]
      : null,
    inventoryDaysTtm === null ? ['inventoryDaysTtm', { status: 'no_data', message: 'TTM 存貨周轉率無法計算或為零，無法換算 DIO 天數。' }] : null,
    receivablesDaysQuarterlyAnnualized === null
      ? ['receivablesDaysQuarterlyAnnualized', { status: 'no_data', message: '應收帳款周轉率（年化）無法計算或為零，無法換算 DSO 天數。' }]
      : null,
    receivablesDaysTtm === null
      ? ['receivablesDaysTtm', { status: 'no_data', message: 'TTM 應收帳款周轉率無法計算或為零，無法換算 DSO 天數。' }]
      : null,
    payablesDaysQuarterlyAnnualized === null
      ? ['payablesDaysQuarterlyAnnualized', { status: 'no_data', message: '應付帳款周轉率（年化）無法計算或為零，無法換算 DPO 天數。' }]
      : null,
    payablesDaysTtm === null
      ? ['payablesDaysTtm', { status: 'no_data', message: 'TTM 應付帳款周轉率無法計算或為零，無法換算 DPO 天數。' }]
      : null,
    cashConversionCycleQuarterlyAnnualized === null
      ? ['cashConversionCycleQuarterlyAnnualized', { status: 'no_data', message: 'DIO/DSO/DPO（年化）任一為 null，無法計算現金轉換週期。' }]
      : null,
    cashConversionCycleTtm === null
      ? ['cashConversionCycleTtm', { status: 'no_data', message: 'TTM DIO/DSO/DPO 任一為 null，無法計算 TTM 現金轉換週期。' }]
      : null,
  ];

  // 存進 oingg-analysis DB 的 turnover_ratio，供之後查歷史紀錄用。存檔失敗不應該讓已經算好的結果回傳失敗。
  try {
    await analysisPrisma.turnoverRatioResult.upsert({
      where: {
        symbol_year_season_dataType_subsidiaryCompanyId: { symbol: symbol, year: yearNum, season: seasonNum, dataType, subsidiaryCompanyId },
      },
      create: {
        symbol: symbol,
        year: yearNum,
        season: seasonNum,
        dataType,
        subsidiaryCompanyId,
        reportDate,
        inventoryTurnoverQuarterly,
        inventoryTurnoverQuarterlyAnnualized,
        inventoryTurnoverTtm,
        receivablesTurnoverQuarterly,
        receivablesTurnoverQuarterlyAnnualized,
        receivablesTurnoverTtm,
        assetTurnoverQuarterly,
        assetTurnoverQuarterlyAnnualized,
        assetTurnoverTtm,
        fixedAssetTurnoverQuarterly,
        fixedAssetTurnoverQuarterlyAnnualized,
        fixedAssetTurnoverTtm,
        payablesTurnoverQuarterly,
        payablesTurnoverQuarterlyAnnualized,
        payablesTurnoverTtm,
        inventoryDaysQuarterlyAnnualized,
        inventoryDaysTtm,
        receivablesDaysQuarterlyAnnualized,
        receivablesDaysTtm,
        payablesDaysQuarterlyAnnualized,
        payablesDaysTtm,
        cashConversionCycleQuarterlyAnnualized,
        cashConversionCycleTtm,
        operatingCostValue: operatingCost,
        operatingCostTtmValue,
        operatingRevenueValue: operatingRevenue,
        operatingRevenueTtmValue,
        inventoryValue: inventory,
        accountsReceivableValue: accountsReceivable,
        totalAssetsValue: totalAssets,
        propertyPlantEquipmentValue: propertyPlantEquipment,
        accountsPayableValue: accountsPayable,
        warnings,
      },
      update: {
        reportDate,
        inventoryTurnoverQuarterly,
        inventoryTurnoverQuarterlyAnnualized,
        inventoryTurnoverTtm,
        receivablesTurnoverQuarterly,
        receivablesTurnoverQuarterlyAnnualized,
        receivablesTurnoverTtm,
        assetTurnoverQuarterly,
        assetTurnoverQuarterlyAnnualized,
        assetTurnoverTtm,
        fixedAssetTurnoverQuarterly,
        fixedAssetTurnoverQuarterlyAnnualized,
        fixedAssetTurnoverTtm,
        payablesTurnoverQuarterly,
        payablesTurnoverQuarterlyAnnualized,
        payablesTurnoverTtm,
        inventoryDaysQuarterlyAnnualized,
        inventoryDaysTtm,
        receivablesDaysQuarterlyAnnualized,
        receivablesDaysTtm,
        payablesDaysQuarterlyAnnualized,
        payablesDaysTtm,
        cashConversionCycleQuarterlyAnnualized,
        cashConversionCycleTtm,
        operatingCostValue: operatingCost,
        operatingCostTtmValue,
        operatingRevenueValue: operatingRevenue,
        operatingRevenueTtmValue,
        inventoryValue: inventory,
        accountsReceivableValue: accountsReceivable,
        totalAssetsValue: totalAssets,
        propertyPlantEquipmentValue: propertyPlantEquipment,
        accountsPayableValue: accountsPayable,
        warnings,
      },
    });
  } catch (error) {
    console.error('[turnover-ratio]: 寫入 turnover_ratio 失敗，不影響本次回傳結果。', error);
  }

  return {
    symbol,
    year,
    season,
    dataType,
    subsidiaryCompanyId,
    reportDate: reportDate?.toISOString().slice(0, 10) ?? null,
    inventoryTurnoverQuarterly,
    inventoryTurnoverQuarterlyAnnualized,
    inventoryTurnoverTtm,
    receivablesTurnoverQuarterly,
    receivablesTurnoverQuarterlyAnnualized,
    receivablesTurnoverTtm,
    assetTurnoverQuarterly,
    assetTurnoverQuarterlyAnnualized,
    assetTurnoverTtm,
    fixedAssetTurnoverQuarterly,
    fixedAssetTurnoverQuarterlyAnnualized,
    fixedAssetTurnoverTtm,
    payablesTurnoverQuarterly,
    payablesTurnoverQuarterlyAnnualized,
    payablesTurnoverTtm,
    inventoryDaysQuarterlyAnnualized,
    inventoryDaysTtm,
    receivablesDaysQuarterlyAnnualized,
    receivablesDaysTtm,
    payablesDaysQuarterlyAnnualized,
    payablesDaysTtm,
    cashConversionCycleQuarterlyAnnualized,
    cashConversionCycleTtm,
    operatingCost: { value: operatingCost?.toString() ?? null },
    operatingCostTtm: { value: operatingCostTtmValue?.toString() ?? null },
    operatingRevenue: { value: operatingRevenue?.toString() ?? null },
    operatingRevenueTtm: { value: operatingRevenueTtmValue?.toString() ?? null },
    inventory: { value: inventory?.toString() ?? null },
    accountsReceivable: { value: accountsReceivable?.toString() ?? null },
    totalAssets: { value: totalAssets?.toString() ?? null },
    propertyPlantEquipment: { value: propertyPlantEquipment?.toString() ?? null },
    accountsPayable: { value: accountsPayable?.toString() ?? null },
    ttm: { quartersUsed, quartersMissing },
    fieldStatuses: buildFieldStatuses(fieldStatusEntries),
    warnings,
  };
};
