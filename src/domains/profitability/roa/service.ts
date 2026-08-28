import prisma from '@/adapters/prisma/index';
import { analysisPrisma } from '@/adapters/prisma/analysisClient';
import { getPastNQuarters } from '@/shared/rocQuarter';
import type { RoaQuery, RoaResult } from './types';

// 淨利欄位選擇邏輯跟 ROE 一致：優先採用「歸屬於母公司」口徑，缺漏時退回用整體數字。
// 注意：教科書上的 ROA 有時會用整體（含少數股權）淨利去對整體總資產，口徑比較「對稱」；
// 這裡為了跟本服務其他指標（ROE、EPS…）一致，維持同一套「先母公司口徑」的選擇邏輯。
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

export const calculateRoa = async (query: RoaQuery): Promise<RoaResult> => {
  const { companyId, year, season, dataType, subsidiaryCompanyId } = query;
  const yearNum = Number(year);
  const seasonNum = Number(season);
  const warnings: string[] = [];

  const where = {
    symbol_year_quarter_dataType_subsidiaryCompanyId: { symbol: companyId, year: yearNum, quarter: seasonNum, dataType, subsidiaryCompanyId },
  };

  const [incomeStatement, balanceSheet] = await Promise.all([
    prisma.quarterlyIncomeStatement.findUnique({ where }),
    prisma.quarterlyBalanceSheet.findUnique({ where }),
  ]);

  const netIncome = pickNetIncome(incomeStatement);
  const totalAssets = balanceSheet?.totalAssets ?? null;

  if (!incomeStatement) warnings.push('查無該季損益表資料。');
  if (!balanceSheet) warnings.push('查無該季資產負債表資料。');
  if (incomeStatement && netIncome.value === null) warnings.push('該季損益表淨利相關欄位皆為 null，無法計算。');
  if (balanceSheet && totalAssets === null) warnings.push('該季資產負債表總資產欄位為 null，無法計算。');

  let roaQuarterlyPct: number | null = null;
  let roaQuarterlyAnnualizedPct: number | null = null;
  if (netIncome.value !== null && totalAssets !== null) {
    roaQuarterlyPct = toPct(netIncome.value, totalAssets);
    if (roaQuarterlyPct !== null) roaQuarterlyAnnualizedPct = Math.round(roaQuarterlyPct * 4 * 100) / 100;
    if (totalAssets <= 0n) warnings.push('本季期末總資產為零或負數，ROA 數值意義有限，請自行判斷是否採用。');
  }

  // TTM：近四季（含本季）淨利加總 / 本季期末總資產。四季資料需全部存在且淨利欄位皆非 null，否則視為不齊。
  const ttmQuarters = getPastNQuarters({ rocYear: yearNum, season }, 4);
  const ttmRecords = await Promise.all(
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
  );

  const quartersUsed: string[] = [];
  const quartersMissing: string[] = [];
  let ttmSum = 0n;
  let ttmComplete = true;
  ttmQuarters.forEach((q, i) => {
    const label = `${q.year}Q${q.season}`;
    const record = ttmRecords[i]!;
    const picked = pickNetIncome(record);
    if (picked.value === null) {
      quartersMissing.push(label);
      ttmComplete = false;
    } else {
      quartersUsed.push(label);
      ttmSum += picked.value;
    }
  });

  let roaTtmPct: number | null = null;
  if (ttmComplete && totalAssets !== null) {
    roaTtmPct = toPct(ttmSum, totalAssets);
  } else if (!ttmComplete) {
    warnings.push(`近四季資料不齊（缺: ${quartersMissing.join(', ')}），無法計算 TTM ROA。`);
  }

  const reportDate = balanceSheet?.reportDate ?? incomeStatement?.reportDate ?? null;

  // 存進 oingg-analysis DB 的 profitability_roa，供之後查歷史紀錄用。存檔失敗不應該讓已經算好的結果回傳失敗。
  try {
    await analysisPrisma.roaResult.upsert({
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
        roaQuarterlyPct,
        roaQuarterlyAnnualizedPct,
        roaTtmPct,
        netIncomeFieldUsed: netIncome.field,
        netIncomeValue: netIncome.value,
        totalAssetsValue: totalAssets,
        warnings,
      },
      update: {
        reportDate,
        roaQuarterlyPct,
        roaQuarterlyAnnualizedPct,
        roaTtmPct,
        netIncomeFieldUsed: netIncome.field,
        netIncomeValue: netIncome.value,
        totalAssetsValue: totalAssets,
        warnings,
      },
    });
  } catch (error) {
    console.error('[roa]: 寫入 profitability_roa 失敗，不影響本次回傳結果。', error);
  }

  return {
    companyId,
    year,
    season,
    dataType,
    subsidiaryCompanyId,
    reportDate: reportDate?.toISOString().slice(0, 10) ?? null,
    roaQuarterlyPct,
    roaQuarterlyAnnualizedPct,
    roaTtmPct,
    netIncome: { fieldUsed: netIncome.field, value: netIncome.value?.toString() ?? null },
    totalAssets: { value: totalAssets?.toString() ?? null },
    ttm: { quartersUsed, quartersMissing },
    warnings,
  };
};
