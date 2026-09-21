import type { MetricBadge } from '@/domain/metrics/metricDefinitionSpec';

// 2026-09-14 曾用 Charlie Munger 的「cannibal」比喻上過一次（門檻 < 0%），2026-09-20 第一輪查證
// 發現 Munger 本人從未訂過量化門檻——「< 0%」是本站自己湊的機械式定義，不符合「作者=原始出處」
// 標準，已下架（見 badgeRegistry.ts 第一輪紀錄）。
//
// 2026-09-21：使用者提供 oingg-conductor-ts 研究筆記（Capital Allocation via Share Contraction...md），
// 裡面引用 Nasdaq US BuyBack Achievers Index（追蹤該指數的 ETF 是 Invesco PKW）方法論的「近四季
// 淨減少流通股數 5% 以上」為成分股資格門檻。這條線索本身不能直接採信（二手彙整報告，引用清單裡
// 混了 podcast/部落格），已直接讀官方方法論 PDF 逐字確認：
//   https://indexes.nasdaqomx.com/docs/Methodology_DRB.pdf（2025 年版，含 changelog）
//   "The Nasdaq US BuyBack Achievers Index is comprised of United States (US) securities issued by
//   corporations that have effected a net reduction in shares outstanding of 5% or more in the
//   trailing twelve months."（Index Description 與 Security Eligibility Criteria 兩處逐字一致）
// changelog 顯示這個措辭從 2013-11-08 生效沿用至今，門檻設定方是 Nasdaq 自己（不是引用/採用別人的
// 數字），符合「單一可指名出處」標準。跟 Munger 的差異：Munger 提出「cannibal」這個比喻描述的是
// 同一種公司行為，但從未訂過具體百分比，所以 author 掛 Nasdaq（實際訂門檻的機構），Munger 的
// 比喻放在 detail 裡當背景說明，不當作者。
//
// 門檻換算：本站 shareCountChangeRate 是「本季流通股數 vs 去年同季」（正值=增加、負值=減少），
// 跟 Nasdaq「trailing twelve months net reduction」是同一種點對點 12 個月比較，符號相反直接對應
// （Nasdaq 的「減少 5% 以上」= 本站的 value ≤ -5）。MetricBadge.threshold.comparator 目前沒有
// 'lte'（只有 warning 子物件才有），用 'lt' + value -5 實作，語意上跟 in_range/abs_lt 相比是最貼近
// 的既有選項，見下方 note。2026-09-21 查過全市場資料深度：7678 筆非 null 值，139 筆 ≤ -5%、覆蓋
// 48 家不同公司（含 2026Q2 的 1808/2023/2314/2329/1563），不是 epsCagr3y 那種近乎打不亮的情況。
export const shareCountChangeRateBadge: MetricBadge = {
  name: '買回成就股',
  nameEn: 'Buyback Achiever',
  author: 'Nasdaq, Inc.',
  sourceUrl: 'https://indexes.nasdaqomx.com/docs/Methodology_DRB.pdf',
  summary: '近四季流通股數淨減少達 5% 以上，達到 Nasdaq 美股買回成就股指數（US BuyBack Achievers Index）的成分股門檻，代表公司持續大量買回並註銷自家股票。',
  detail:
    'Charlie Munger 用「cannibal」（食人族）比喻持續大量買回並註銷自家股票的公司——流通股數' +
    '越變越少，讓每一股能分到的獲利/淨資產份額變大，但 Munger 本人從未訂過具體百分比。這支' +
    '徽章的量化門檻出自 Nasdaq US BuyBack Achievers Index（追蹤該指數的 ETF 是 Invesco PKW）' +
    '2013 年起沿用至今的成分股資格：近四季淨減少流通股數 5% 以上。股數減少本身不創造新價值，' +
    '前提是公司同時維持穩定的獲利與現金流，否則單純縮股數可能只是掩蓋本業衰退。',
  timeframe: 'Q',
  threshold: {
    description: '< -5%',
    thresholdLatex: '\\mathrm{ShareCountChangeRate} < -5',
    note: 'Nasdaq 原文是「trailing twelve months 淨減少 5% 或以上」（≤ -5%），本站用嚴格小於 -5% 實作——避免為了這個機率可忽略的邊界案例（財務數字精確等於 -5.000000%）新增 comparator 列舉值。',
    denominator: 1,
    comparator: 'lt',
    value: -5,
  },
};
