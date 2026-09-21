import type { MetricBadge } from '@/domain/metrics/metricDefinitionSpec';

// 2026-09-21：Aswath Damodaran（紐約大學史登商學院教授，公司估值領域被引用次數最多的學者之一）在
// 個人網站公開維護並逐年更新一張「利息保障倍數 → 信評等級」的合成信評對照表（給沒有實際發債評等
// 的公司估算資金成本用），已實際 fetch 確認逐字存在：
//   https://pages.stern.nyu.edu/~adamodar/New_Home_Page/datafile/ratings.html
//   大型非金融業公司對照表（節錄）：Aaa/AAA ≥8.50、Aa2/AA 6.5–8.499999、A1/A+ 5.5–6.499999、
//   A2/A 4.25–5.499999、A3/A- 3–4.249999、Baa2/BBB 2.5–2.999999（投資等級下限）、
//   Ba1/BB+ 2.25–2.49999（以下為非投資等級）……一路到 B3/B- 1.25–1.499999、
//   Caa/CCC 0.8–1.249999、D2/D <0.2。
// 這是本站目前唯一在 Damodaran 網站上找到的「比率對應分級」表（其餘資料集是產業平均值統計，
// 不是分級門檻，不符合單一可指名出處標準，見查證紀錄）。門檻選投資等級下限（Baa2/BBB 級下緣
// 2.5），比照 altmanZScoreBadge 用安全區門檻、piotroskiFScoreBadge 用強/弱兩端的既有模式。
export const interestCoverageBadge: MetricBadge = {
  name: '利息保障倍數投資等級門檻',
  nameEn: 'Interest Coverage Investment-Grade Threshold',
  author: 'Aswath Damodaran',
  sourceUrl: 'https://pages.stern.nyu.edu/~adamodar/New_Home_Page/datafile/ratings.html',
  summary: '近四季 EBIT 是近四季利息費用的 2.5 倍以上，對照 Damodaran 合成信評表大約落在 BBB／Baa2（投資等級下限）以上的區間。',
  detail:
    'Aswath Damodaran 在個人網站公開維護一張「利息保障倍數（EBIT/利息費用）對應信評等級」的合成' +
    '信評表，給沒有實際發債評等的公司估算違約風險溢酬用，逐年更新。大型非金融業公司的投資等級' +
    '（BBB／Baa2）下限大約落在 2.5 倍，低於這個數字對照表上落在非投資等級（BB 以下，俗稱垃圾債）' +
    '區間。這是信用風險的合成估算，不是本站或任何機構給這家公司的實際信用評等。',
  timeframe: 'TTM',
  threshold: {
    description: '≥ 2.5',
    thresholdLatex: '\\mathrm{InterestCoverage} \\geq 2.5',
    note: 'Damodaran 合成信評表裡 Baa2/BBB（投資等級下限）的區間下緣，金融業本身不適用這張表。',
    denominator: 1,
    comparator: 'gte',
    value: 2.5,
    warning: {
      description: '< 1.5',
      thresholdLatex: '\\mathrm{InterestCoverage} \\lt 1.5',
      note: '對照表 B2/B（1.5–1.749999）以下，落在 B3/B- 或更差的高風險區間。',
      comparator: 'lt',
      value: 1.5,
    },
  },
};
