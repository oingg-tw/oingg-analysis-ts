import type { MetricBadge } from '@/domain/metrics/metricDefinitionSpec';

// 2026-09-22：S&P Global Ratings《Criteria | Corporates | General: Corporate Methodology》（2024-01-07 版），
// Table 17「Cash Flow/Leverage Analysis Ratios—Standard Volatility」的 Debt/EBITDA 欄。sourceUrl 是 S&P 以色列
// 子公司 Maalot 公開的同一份文件（spglobal.com 原站 https://www.spglobal.com/ratings/en/regulatory/article/-/view/
// sourceId/12913251 對爬蟲擋、人用瀏覽器可開），已下載逐字核對（PDF 第 33–34 頁）：
//   Minimal「Less than 1.5」、Modest「1.5-2」、Intermediate「2-3」、Significant「3-4」、Aggressive「4-5」、
//   Highly leveraged「Greater than 5」。同表另有 FOCF/debt(%)：Minimal「40+」… Highly leveraged「Less than 5」，
//   EBITDA/interest(x)：Minimal「More than 15」… Highly leveraged「Less than 2」。
// 跟已上線的 interestCoverageBadge（Damodaran 合成信評表）同一種「機構分級表」性質，門檻選最好一級（minimal）
// 的上緣 1.5x，warning 選最差一級（highly leveraged）的下緣 5x——出處本身就給了兩條線，符合 threshold.warning
// 「只有出處寫了低端數字才填」的規則。中華信評（Taiwan Ratings）是 S&P 子公司，對台灣發行人適用同一套準則。
// 已知落差：S&P 的 debt 是調整後負債（租賃、退休金加回、只扣 surplus cash），本站 netDebtToEbitda 是有息負債減
// 全部現金，數字偏樂觀；Table 17 是 standard volatility 表，低波動產業（Table 18/19）門檻更寬（minimal < 1.75/< 2）。
// 負 EBITDA 的公司自 formulaVersion 2 起不計算（見 computeNetDebtToEbitda.ts），不會以負倍數誤判通過。
export const netDebtToEbitdaBadge: MetricBadge = {
  name: '淨負債對 EBITDA 比信評最低槓桿級',
  nameEn: 'Net Debt to EBITDA Minimal-Leverage Band',
  author: 'S&P Global Ratings',
  sourceUrl: 'https://www.maalot.co.il/Publications/MT20240214173645.PDF',
  summary: '本季期末淨負債不到近四季 EBITDA 的 1.5 倍，對照 S&P 企業信評準則的現金流/槓桿分級表落在最低槓桿（minimal）一級。',
  detail:
    'S&P Global Ratings 的企業信評準則公開一張「現金流／槓桿分級表」，把 Debt/EBITDA 分成六級：低於 1.5 倍是最低' +
    '槓桿（minimal）、1.5–2 倍為 modest、2–3 倍為 intermediate、3–4 倍為 significant、4–5 倍為 aggressive、超過 5 倍' +
    '是高槓桿（highly leveraged）。這張表是信評機構評估財務風險的標準工具之一，不是本站或任何機構給這家公司的' +
    '實際信用評等。本站的淨負債是有息負債減去全部現金及約當現金，比 S&P 的調整後負債口徑寬鬆，倍數會比信評口徑小；' +
    '淨現金公司（淨負債為負）的倍數為負，同樣落在最低槓桿一級。',
  timeframe: 'TTM',
  threshold: {
    description: '< 1.5',
    thresholdLatex: '\\mathrm{NetDebtToEbitda} \\lt 1.5',
    note: 'S&P Corporate Methodology Table 17（standard volatility）Debt/EBITDA「Less than 1.5」= minimal。低波動產業用的 Table 18/19 門檻更寬，本站一律用 standard 表；EBITDA ≤ 0 不計算。',
    denominator: 1,
    comparator: 'lt',
    value: 1.5,
    warning: {
      description: '> 5',
      thresholdLatex: '\\mathrm{NetDebtToEbitda} \\gt 5',
      note: '同表「Greater than 5」= highly leveraged，六級裡最差的一級。',
      comparator: 'gt',
      value: 5,
    },
  },
};
