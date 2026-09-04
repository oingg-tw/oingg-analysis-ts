import { analysisPrisma } from '@/adapters/prisma/analysisClient';
import { buildFieldStatuses, type MetricStatus } from '@/shared/metricStatus';
import { getPastNQuarters } from '@/shared/rocQuarter';
import { getLatestAvailableQuarter } from '@/shared/sourceData/latestQuarter';
import { getQuarterlyCashFlowStatement, getQuarterlyIncomeStatement } from '@/shared/sourceData/mopsQuarterlyStatements';
import type { OcfToNetIncomeQuery, OcfToNetIncomeResult } from './types';

// 淨利欄位選擇邏輯跟 ROE/EPS 一致：優先採用「歸屬於母公司」口徑，缺漏時退回用整體數字。
const pickNetIncome = (
  record: { netIncomeAttributableToParent: bigint | null; netIncome: bigint | null } | null
): { field: 'netIncomeAttributableToParent' | 'netIncome' | null; value: bigint | null } => {
  if (!record) return { field: null, value: null };
  if (record.netIncomeAttributableToParent !== null) return { field: 'netIncomeAttributableToParent', value: record.netIncomeAttributableToParent };
  if (record.netIncome !== null) return { field: 'netIncome', value: record.netIncome };
  return { field: null, value: null };
};

const toRatio = (numerator: bigint, denominator: bigint): number | null => {
  if (denominator === 0n) return null;
  return Math.round((Number(numerator) / Number(denominator)) * 100) / 100; // 四捨五入到小數 2 位，單位是「倍」
};

const emptyResult = (symbol: string, dataType: '1' | '2', subsidiaryCompanyId: string, warnings: string[]): OcfToNetIncomeResult => ({
  symbol,
  year: null,
  season: null,
  dataType,
  subsidiaryCompanyId,
  reportDate: null,
  ocfToNetIncomeQuarterly: null,
  ocfToNetIncomeTtm: null,
  operatingCashFlow: { value: null },
  operatingCashFlowTtm: { value: null },
  netIncome: { fieldUsed: null, value: null },
  netIncomeTtm: { value: null },
  ttm: { quartersUsed: [], quartersMissing: [] },
  fieldStatuses: {},
  warnings,
});

export const calculateOcfToNetIncome = async (query: OcfToNetIncomeQuery): Promise<OcfToNetIncomeResult> => {
  const { symbol, dataType, subsidiaryCompanyId } = query;
  const warnings: string[] = [];

  // year/season 沒指定時，自動抓「這家公司損益表跟現金流量表都有資料」的最新一季——不同公司財報申報
  // 進度不同步，見 shared/sourceData/latestQuarter.ts。
  const resolvedQuarter =
    query.year !== undefined && query.season !== undefined
      ? { year: query.year, season: query.season }
      : await getLatestAvailableQuarter(symbol, dataType, subsidiaryCompanyId, ['incomeStatement', 'cashFlowStatement']);
  if (!resolvedQuarter) {
    return emptyResult(symbol, dataType, subsidiaryCompanyId, ['查無任何一季損益表/現金流量表都有資料的季度，無法決定要用哪一季計算營運現金流對淨利比。']);
  }
  const { year, season } = resolvedQuarter;
  const yearNum = Number(year);
  const seasonNum = Number(season);

  const key = { symbol: symbol, year: yearNum, quarter: seasonNum, dataType, subsidiaryCompanyId };

  const [currentIncomeStatement, currentCashFlow] = await Promise.all([
    getQuarterlyIncomeStatement(key),
    getQuarterlyCashFlowStatement(key),
  ]);

  if (!currentIncomeStatement) warnings.push('查無該季損益表資料。');
  if (!currentCashFlow) warnings.push('查無該季現金流量表資料。');

  const netIncome = pickNetIncome(currentIncomeStatement);
  const operatingCashFlow = currentCashFlow?.netCashFromOperatingActivities ?? null;
  if (currentIncomeStatement && netIncome.value === null) warnings.push('該季損益表淨利相關欄位皆為 null，無法計算。');
  if (currentCashFlow && operatingCashFlow === null) warnings.push('該季現金流量表營業活動現金流量欄位為 null，無法計算。');

  let ocfToNetIncomeQuarterly: number | null = null;
  if (operatingCashFlow !== null && netIncome.value !== null) {
    ocfToNetIncomeQuarterly = toRatio(operatingCashFlow, netIncome.value);
    if (netIncome.value <= 0n) warnings.push('本季淨利為零或負數，營運現金流對淨利比數值意義有限，請自行判斷是否採用。');
  }

  // TTM：近四季（含本季）OCF、淨利各自加總。一季只要 OCF 或淨利任一缺漏就視為該季不齊，
  // 共用同一組完整性判斷，跟 netDebtToEbitda 的雙表 TTM 判斷同一種模式。
  const ttmQuarters = getPastNQuarters({ rocYear: yearNum, season }, 4);
  const [ttmIncomeRecords, ttmCashFlowRecords] = await Promise.all([
    Promise.all(
      ttmQuarters.map((q) =>
        getQuarterlyIncomeStatement({
          symbol: symbol,
          year: Number(q.year),
          quarter: Number(q.season),
          dataType,
          subsidiaryCompanyId,
        })
      )
    ),
    Promise.all(
      ttmQuarters.map((q) =>
        getQuarterlyCashFlowStatement({
          symbol: symbol,
          year: Number(q.year),
          quarter: Number(q.season),
          dataType,
          subsidiaryCompanyId,
        })
      )
    ),
  ]);

  const quartersUsed: string[] = [];
  const quartersMissing: string[] = [];
  let netIncomeTtmSum = 0n;
  let ocfTtmSum = 0n;
  let ttmComplete = true;
  ttmQuarters.forEach((q, i) => {
    const label = `${q.year}Q${q.season}`;
    const picked = pickNetIncome(ttmIncomeRecords[i]!);
    const cashFlowRecord = ttmCashFlowRecords[i]!;
    if (picked.value === null || cashFlowRecord === null || cashFlowRecord.netCashFromOperatingActivities === null) {
      quartersMissing.push(label);
      ttmComplete = false;
    } else {
      quartersUsed.push(label);
      netIncomeTtmSum += picked.value;
      ocfTtmSum += cashFlowRecord.netCashFromOperatingActivities;
    }
  });
  if (!ttmComplete) warnings.push(`近四季資料不齊（缺: ${quartersMissing.join(', ')}），無法計算 TTM 營運現金流對淨利比。`);

  const netIncomeTtmValue = ttmComplete ? netIncomeTtmSum : null;
  const operatingCashFlowTtmValue = ttmComplete ? ocfTtmSum : null;

  const ocfToNetIncomeTtm =
    operatingCashFlowTtmValue !== null && netIncomeTtmValue !== null ? toRatio(operatingCashFlowTtmValue, netIncomeTtmValue) : null;

  const reportDate = currentIncomeStatement?.reportDate ?? currentCashFlow?.reportDate ?? null;

  const fieldStatusEntries: Array<[string, MetricStatus] | null> = [
    ocfToNetIncomeQuarterly === null
      ? ['ocfToNetIncomeQuarterly', { status: 'no_data', message: '本季營業活動現金流量或淨利缺漏，無法計算營運現金流對淨利比。' }]
      : null,
    ocfToNetIncomeTtm === null ? ['ocfToNetIncomeTtm', { status: 'no_data', message: '近四季資料不齊，無法計算 TTM 營運現金流對淨利比。' }] : null,
  ];

  // 存進 oingg-analysis DB 的 cash_flow_ocf_to_net_income，供之後查歷史紀錄用。存檔失敗不應該讓已經算好的結果回傳失敗。
  try {
    await analysisPrisma.ocfToNetIncomeResult.upsert({
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
        ocfToNetIncomeQuarterly,
        ocfToNetIncomeTtm,
        operatingCashFlowValue: operatingCashFlow,
        operatingCashFlowTtmValue,
        netIncomeFieldUsed: netIncome.field,
        netIncomeValue: netIncome.value,
        netIncomeTtmValue,
        warnings,
      },
      update: {
        reportDate,
        ocfToNetIncomeQuarterly,
        ocfToNetIncomeTtm,
        operatingCashFlowValue: operatingCashFlow,
        operatingCashFlowTtmValue,
        netIncomeFieldUsed: netIncome.field,
        netIncomeValue: netIncome.value,
        netIncomeTtmValue,
        warnings,
      },
    });
  } catch (error) {
    console.error('[ocf-to-net-income]: 寫入 cash_flow_ocf_to_net_income 失敗，不影響本次回傳結果。', error);
  }

  return {
    symbol,
    year,
    season,
    dataType,
    subsidiaryCompanyId,
    reportDate: reportDate?.toISOString().slice(0, 10) ?? null,
    ocfToNetIncomeQuarterly,
    ocfToNetIncomeTtm,
    operatingCashFlow: { value: operatingCashFlow?.toString() ?? null },
    operatingCashFlowTtm: { value: operatingCashFlowTtmValue?.toString() ?? null },
    netIncome: { fieldUsed: netIncome.field, value: netIncome.value?.toString() ?? null },
    netIncomeTtm: { value: netIncomeTtmValue?.toString() ?? null },
    ttm: { quartersUsed, quartersMissing },
    fieldStatuses: buildFieldStatuses(fieldStatusEntries),
    warnings,
  };
};
