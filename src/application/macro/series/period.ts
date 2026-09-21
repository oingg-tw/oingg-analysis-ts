// 總經序列的期間字串：月 'YYYY-MM'、季 'YYYY-Qn'。字典序 = 時間序，所以 `from` 過濾直接比字串。
export const toMonthPeriod = (year: number, month: number): string => `${year}-${String(month).padStart(2, '0')}`;
export const toQuarterPeriod = (year: number, quarter: number): string => `${year}-Q${quarter}`;
