import type { MetricNullReason } from '../metricBasis';

// 通用數字工具，給拆出來的各支指標計算檔案（pitMetrics/<分類>/<指標>/calculateXxx.ts）共用
// ——2026-09-08 從 dupont/turnoverRatio/margins/bankCapitalAdequacy/cashFlowPerShare 五個
// family 檔案各自重複定義的同款工具（toPct/toRatio/toTurnover/round2/determineNullReason
// 等，命名雖略有不同但公式完全一樣）合併成這一份，避免每支指標各自散落一份幾乎相同的複製碼。
// 這裡放的是純數學轉換/缺輸入原因判斷，不涉及任何單一指標的業務公式（業務公式留在各自的
// calculateXxx.ts）。

export interface CalcResult {
  value: number | null;
  nullReason: MetricNullReason | null;
}

// 百分比（× 100%），四捨五入到小數 2 位——dupont/margins 家族的比率型指標（淨利率/毛利率/
// 稅務負擔…）都是這個尺度。
export const toPercent = (numerator: bigint, denominator: bigint): number | null => {
  if (denominator === 0n) return null;
  return Math.round((Number(numerator) / Number(denominator)) * 100 * 100) / 100;
};

// 倍數/次數型（不乘 100%），四捨五入到小數 2 位——資產週轉率、權益乘數、存貨/應收/應付
// 週轉率這類「幾次」的指標都是這個尺度。
export const toRatio = (numerator: bigint, denominator: bigint): number | null => {
  if (denominator === 0n) return null;
  return Math.round((Number(numerator) / Number(denominator)) * 100) / 100;
};

export const round2 = (x: number): number => Math.round(x * 100) / 100;

// number 版 toRatio——跟 toRatio 公式完全對應，只是分子分母已經是 number（不是財報原始
// bigint），grahamNumber/pbRatio/pegRatio/peRatio 這類混合 EV/市值/股價（number）跟財報
// 金額（bigint，已先各自換算成 number）的估值指標共用。
export const toRatioFromNumbers = (numerator: number, denominator: number): number | null => {
  if (denominator === 0) return null;
  return Math.round((numerator / denominator) * 100) / 100;
};

// 4 位小數版的 toRatio/toRatioFromNumbers——altmanZDoublePrimeScore/altmanZScore/tobinsQ
// 這類財務危機/估值評分模型的係數需要比一般比率型指標更高的精度，2 位小數會讓組成分數的
// 小尺度變量被無謂捨去。
export const toRatio4 = (numerator: bigint, denominator: bigint): number | null => {
  if (denominator === 0n) return null;
  return Math.round((Number(numerator) / Number(denominator)) * 10000) / 10000;
};

export const toRatio4FromNumbers = (numerator: number, denominator: number): number | null => {
  if (denominator === 0) return null;
  return Math.round((numerator / denominator) * 10000) / 10000;
};

// EV/市值（number，單位元）除以財報原始金額（bigint，單位千元）的估值倍數——分母先換算
// 成元再相除，四捨五入到小數 2 位。evEbitda/evToEbit/evToFcf/pFcf/psr/priceToResearchRatio/
// cashFlowValuationFamily 這類「分子是估值層算出來的 number，分母是財報 bigint 金額」的
// 指標共用。
export const toMultipleFromThousands = (numerator: number, amountInThousands: bigint): number | null => {
  const denominator = Number(amountInThousands) * 1000;
  if (denominator === 0) return null;
  return Math.round((numerator / denominator) * 100) / 100;
};

// bigint 版絕對值——capexToRevenue/abnormalCapexRatio 這類「來源資料本身是負值（現金流出）
// 取絕對值後再算比率」的指標共用。
export const absBigint = (value: bigint): bigint => (value < 0n ? -value : value);

// 每股金額——分子是財報原始金額（單位：千元），乘 1000 換算成元之後除以流通股數，
// 四捨五入到小數 2 位。ocfPerShare/fcfPerShare 用這個換算。
export const toPerShare = (numeratorInThousands: bigint, shares: bigint): number | null => {
  if (shares === 0n) return null;
  return Math.round(((Number(numeratorInThousands) * 1000) / Number(shares)) * 100) / 100;
};

// 有效數字（不是小數位數）——市值這類金額級距差很大的數字（幾億到幾兆都有），固定小數點
// 後幾位沒有意義（幾兆的數字小數點後兩位毫無意義，幾千萬的數字小數點後兩位又太瑣碎），
// 改用「保留 N 位有效數字」才是使用者真正想看到的精度。2026-09-11 使用者要求：個股篩選
// 的市值欄位只需要 4 位有效數字（例如 62,108,026,310,465 顯示成 62,110,000,000,000）。
export const roundToSignificantFigures = (value: number, sigFigs: number): number => {
  if (value === 0) return 0;
  const magnitude = Math.floor(Math.log10(Math.abs(value)));
  const factor = Math.pow(10, sigFigs - 1 - magnitude);
  return Math.round(value * factor) / factor;
};

// DIO/DSO/DPO = 365 ÷ 週轉率（年化或 TTM 版本）。周轉率為 0 時無法換算天數，回傳 null。
export const toDays = (turnover: number | null): number | null => {
  if (turnover === null || turnover === 0) return null;
  return Math.round((365 / turnover) * 100) / 100;
};

// 分子/分母任一為 null 視為缺輸入；兩者皆非 null 但分母為 0 才是「分母為零」——負值不擋，
// 沿用既有「扭曲但仍是真實數字」的行為。
export const determineNullReason = (numerator: bigint | null, denominator: bigint | null): MetricNullReason => {
  if (numerator === null || denominator === null) return 'missing_input';
  return 'zero_or_negative_denominator';
};

// YoY 成長率 = (本期 - 去年同期) / |去年同期| * 100——assetGrowth/equityGrowthRate/
// netIncomeGrowthRate/operatingIncomeGrowthRate/revenueGrowthRate/epsGrowthRate/
// bvpsGrowthRate 這組「單季年增率」指標共用同一條公式，去年同期用 getPastNQuarters
// ({rocYear,season},5)[0] 取得（各自呼叫端負責），這裡只負責公式本身跟 nullReason 判斷。
// number 版給 EPS/BVPS 這類已經是浮點每股數字的輸入；bigint 版給資產/權益/淨利/營業利益/
// 營收這類財報原始金額（單位千元）直接用，維持原本「先用 bigint 相減再轉 Number」的計算
// 順序，避免大數先各自轉 Number 再相減可能引入的精度差異（雖然在千元單位下這組數字實務上
// 遠低於 Number.MAX_SAFE_INTEGER，這裡仍選擇跟舊寫法逐位元一致）。
export const calculateYoyGrowthRate = (current: number | null, prior: number | null): CalcResult => {
  const value = current !== null && prior !== null && prior !== 0 ? Math.round(((current - prior) / Math.abs(prior)) * 100 * 100) / 100 : null;
  return { value, nullReason: value !== null ? null : current === null || prior === null ? 'missing_input' : 'zero_or_negative_denominator' };
};

export const calculateYoyGrowthRateBigint = (current: bigint | null, prior: bigint | null): CalcResult => {
  const value = current !== null && prior !== null && prior !== 0n ? Math.round((Number(current - prior) / Math.abs(Number(prior))) * 100 * 100) / 100 : null;
  return { value, nullReason: value !== null ? null : current === null || prior === null ? 'missing_input' : 'zero_or_negative_denominator' };
};

// 天數指標（DIO/DSO/DPO）null_reason：對應周轉率本身為 0（除以零）回報
// zero_or_negative_denominator；周轉率本身就是 null，原因照搬周轉率自己的 nullReason。
export const daysNullReason = (turnover: number | null, turnoverNullReason: MetricNullReason | null): MetricNullReason => {
  if (turnover === 0) return 'zero_or_negative_denominator';
  return turnoverNullReason ?? 'missing_input';
};
