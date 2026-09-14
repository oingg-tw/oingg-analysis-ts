import type { MetricBadge } from '@/domainPitMetrics/metricDefinitionSpec';

// "Dividend cover" ≥ 2x 是英國股利分析傳統裡廣泛引用的安全門檻（Wikipedia「Dividend
// cover」條目、CFI 等多方來源交叉引用一致），不是單一學者/機構提出的專屬模型，是業界長年
// 累積的市場慣例。這支指標本身是 FCF 版（跟原始 dividend cover 用 EPS/DPS 當分子分母不同，
// 見 dividendCoverageRatioDefinition.ts 的說明），套用同一個 2 倍安全門檻是沿用同一個
// 「配息能力至少要有一倍緩衝」的核心邏輯，不是原始定義的精確複製。
export const dividendCoverageRatioBadge: MetricBadge = {
  name: '股利保障安全邊際',
  nameEn: 'Dividend Cover Safety Margin',
  author: '業界慣例（英國股利分析傳統）',
  summary: '自由現金流是股利發放現金的 2 倍以上，配息有充分緩衝，不必仰賴舉債或變賣資產硬撐。',
  detail:
    '「Dividend cover」是英國股利投資圈長年沿用的安全邊際慣例：配息保障倍數達到 2 倍以上' +
    '被普遍視為穩健（低於 1.5 倍緩衝縮減、低於 1 倍代表當年獲利不足以支應股利，得靠保留' +
    '盈餘或舉債硬撐）。原始定義用 EPS/每股股利計算，這裡用的是本站的現金流量版本（自由' +
    '現金流 / 股利發放現金），衡量配息是不是真的有自由現金流撐得住，套用同一個 2 倍門檻' +
    '沿用同一套「至少一倍緩衝」的核心邏輯，不是原始定義的精確複製。',
  timeframe: 'TTM',
  threshold: { description: '≥ 2 倍', thresholdLatex: '\\mathrm{DividendCoverageRatio} \\geq 2', note: '英國股利分析傳統的安全門檻，套用在本站的 FCF 版保障倍數上，非原始 EPS 版定義的精確複製', denominator: 1, comparator: 'gte', value: 2 },
};
