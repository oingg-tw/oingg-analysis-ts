// 從 oingg-mops-ts 的 src/shared/rocQuarter.ts 複製精簡而來（只保留本服務需要的部分）。
// 本服務不負責抓取/回補資料，因此不需要 getLatestAvailableQuarter / getQuarterEndDate。
export type Season = '1' | '2' | '3' | '4';

// 2026-09-05 ROE spike 當時獨立開了 src/pitMetrics/rocYear.ts，理由是「不異動這支現有
// 36 支指標共用的檔案」——2026-09-07 因子分類整批搬動 pitMetrics/ 目錄結構時，這個
// 「不異動」的理由已經不成立（本來就要重新檢視每一處相對 import），改併回這裡，跟
// formatRocYearSeasonAsOfDate 共用同一份「民國年+1911=西元年」邏輯，不要兩處各自維護
// 一份一樣的算式。
export const rocYearToGregorian = (rocYear: number): number => rocYear + 1911;

const SEASONS_DESC: Season[] = ['4', '3', '2', '1'];

// 由 latest 往前數 n 季（含 latest 本身），依時間先後（舊 -> 新）回傳。
export const getPastNQuarters = (latest: { rocYear: number; season: Season }, n: number): { year: string; season: Season }[] => {
  const quarters: { rocYear: number; season: Season }[] = [];
  let { rocYear, season } = latest;
  for (let i = 0; i < n; i++) {
    quarters.push({ rocYear, season });
    const idx = SEASONS_DESC.indexOf(season);
    if (idx === SEASONS_DESC.length - 1) {
      rocYear -= 1;
      season = '4';
    } else {
      season = SEASONS_DESC[idx + 1]!;
    }
  }
  return quarters.reverse().map((q) => ({ year: String(q.rocYear), season: q.season }));
};

// 民國年轉西元年後兩碼 + 季度，例如 rocYear=115, season=2 -> 西元 2026 -> "26Q2"（screener 的
// asOfDate 格式，2026-09-01 應 bff-ts 要求新增——他們踩過直接把民國年當西元年用的 bug，
// 所以要求季報類欄位一律用這個格式，直接從 year/season 組，不要從 reportDate 反推）。
export const formatRocYearSeasonAsOfDate = (rocYear: number, season: number): string => {
  const gregorianYear = rocYearToGregorian(rocYear);
  return `${String(gregorianYear).slice(-2)}Q${season}`;
};
