import type { MetricBadge } from '@/domain/metrics/metricDefinitionSpec';

// Benjamin Graham《The Intelligent Investor》防禦型投資者七條規則之一：「Strong Financial
// Condition」——原文是流動比率 ≥ 2 且長期負債 ≤ 淨流動資產兩個條件合起來，這裡只實作流動比率
// 這半條，後半條件見 longTermDebtToNetCurrentAssetsBadge.ts（2026-09-15 補上，之前這裡曾
// 寫「長期負債 vs 淨流動資產不是現成 metricCode」，已不是事實），兩個徽章合起來才是完整版
// 原始規則，detail 裡仍誠實說明這支只涵蓋一半，不要讓使用者誤以為單看這個徽章就是完整版。
export const currentRatioBadge: MetricBadge = {
  name: '財務體質健全',
  nameEn: 'Sufficiently Strong Financial Condition',
  author: 'Benjamin Graham, 1949',
  summary: '流動資產至少是流動負債的兩倍，短期償債能力有充分緩衝。',
  detail:
    'Benjamin Graham 在《The Intelligent Investor》為「防禦型投資者」訂出的七條選股規則之一' +
    '（財務體質健全測試）：流動資產至少是流動負債的兩倍，代表公司短期內即使營收停滯，也有' +
    '充分的流動資產可以應付到期的流動負債，不至於陷入周轉危機。Graham 原始規則的財務體質' +
    '測試還包含另一半條件（長期負債不超過淨流動資產，見「長期負債安全邊際」徽章），這裡只' +
    '實作流動比率這一半，不是完整版的原始規則。',
  timeframe: 'Q',
  threshold: { description: '≥ 200%', thresholdLatex: '\\mathrm{CurrentRatio} \\geq 200', note: 'Graham 防禦型投資者財務體質測試的其中一半條件，即流動比率至少 2 倍（200%），跟這支指標本身 unit=% 的儲存尺度一致', denominator: 1, comparator: 'gte', value: 200 },
};
