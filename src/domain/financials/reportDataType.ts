import type { StatementDataType } from './quarterlyMetric';

// 2026-09-27 財報口徑按期別決定（使用者：31 家「後來改成只編個體報表」的公司「按期別選，歷史接起來」）。
// 原本「每家一種口徑、有合併就永遠用 '2'」讓 2941、4126、5403、1623、1727、1524 這些處分子公司後只編個體報表的公司，
// 合併報表停掉之後的每一季指標全部查不到（2941 合併停在 111Q4、個體一路報到 115Q2）。
// 規則（仍守住 2026-09-22 使用者拍板的「合併期間某季缺列寧可 insufficient，不拿個體頂」）：
// - 落在合併報表的申報範圍內（最早～最晚合併季）→ '2'，那一季就算缺列也不換個體。
// - 在合併範圍之外、有個體報表 → '1'。但「合併範圍之後」只有個體報表比合併多報 2 季以上才算改制——差 1 季多半是合併晚交，不切。
// - 其他（沒有期別、或期別兩種都不在範圍內）→ 最新一期的口徑。
// yq = 民國年×10＋季（mops-ts export.company_report_availability 的格式）。
export interface ReportAvailability {
  hasConsolidated: boolean;
  hasIndividual: boolean;
  earliestConsolidatedYq: number | null;
  latestConsolidatedYq: number | null;
  earliestIndividualYq: number | null;
  latestIndividualYq: number | null;
}

const SWITCH_MIN_LAG_QUARTERS = 2;
const quarterIndex = (yq: number) => Math.floor(yq / 10) * 4 + (yq % 10);

const switchedToIndividual = (a: ReportAvailability): boolean =>
  a.hasConsolidated && a.hasIndividual && a.latestConsolidatedYq !== null && a.latestIndividualYq !== null &&
  quarterIndex(a.latestIndividualYq) - quarterIndex(a.latestConsolidatedYq) >= SWITCH_MIN_LAG_QUARTERS;

// 最新一期（逐日型指標、最新值查詢、沒有期別的呼叫）用的口徑。
export const latestDataType = (a: ReportAvailability): StatementDataType => (!a.hasConsolidated || switchedToIndividual(a) ? '1' : '2');

export const dataTypeForPeriod = (a: ReportAvailability, yq: number): StatementDataType => {
  const inRange = (from: number | null, to: number | null) => from !== null && to !== null && yq >= from && yq <= to;
  if (a.hasConsolidated && inRange(a.earliestConsolidatedYq, a.latestConsolidatedYq)) return '2';
  if (a.hasIndividual && a.earliestIndividualYq !== null && yq >= a.earliestIndividualYq) {
    const afterConsolidated = a.latestConsolidatedYq !== null && yq > a.latestConsolidatedYq;
    if (!a.hasConsolidated || !afterConsolidated || switchedToIndividual(a)) return '1';
  }
  return latestDataType(a);
};
