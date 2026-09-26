import type { MetricBadge } from '@/domain/metrics/metricDefinitionSpec';

// 2026-09-26 使用者要求「CROIC 有機會做成徽章嗎」，查證兩輪（研究 agent）：
// - 唯一過得了出處規則的是 Joe (Joel) Ponzio。Old School Value 的 Jae Jun 明寫 "CROIC is a fantastic metric first
//   popularized by Joe Ponzio of F Wall Street."，所以 author 掛 Ponzio。
// - 門檻用他 2009 年正式出版的書，不用 2007 年部落格：書《F Wall Street: Joe Ponzio's No-Nonsense Approach to Value
//   Investing For the Rest of Us》（Adams Media，2009；Google Books pCbrDQAAQBAJ，ISBN 9781440519758）電子版位置 PT118，
//   小節「WHAT IS AN ACCEPTABLE CROIC?」逐字："There is no hard, fast rule for CROIC. Personally, I like to see CROIC above
//   10 percent. That said, an extremely high CROIC (e.g., 45 percent) cannot be sustained for very long."
//   部落格〈What The Heck Is CROIC?〉（2007-07-17，原站 fwallstreet.com 現回 530，Wayback 存檔可讀）寫的是 13%；
//   使用者原本說「真找不到就用 13%」，第二輪找到書（較晚、正式出版）所以改 10%。
// - 查證方式：研究 agent 用 Google Books 書內搜尋實際讀到 PT118 原句；主 session 2026-09-26 重查時被 Google 限流（429／驗證碼），
//   只確認到書目（Google Books feed：Joel Ponzio，2009-05-18），沒有親自再讀一次原句。之後有機會要補讀。
// - 定義差異（note 照實交代）：Ponzio 分子用業主盈餘（書中說大型穩定企業可用自由現金流近似）、分母是股東權益加「全部」長期負債、
//   不扣現金；這裡是近四季自由現金流 ÷（有息負債＋權益－現金）。現金多的公司這裡的值會比照他的算法高。
// - 書中沒有寫低端警戒數字（只說 "a weak business with a low CROIC may be too fragile to survive"），所以不設 warning。
// - 學術文獻、實務書（Mauboussin、McKinsey 等）、台灣來源都找不到用 FCF÷投入資本訂明確切點的；台灣實證（percentile 型）也沒有，
//   所以不做 percentile 徽章。2026Q2 全市場近四季有值 1,825 家、中位數 2.7%，≥10% 的 582 家（32%）。
export const croicBadge: MetricBadge = {
  name: 'Ponzio 現金投入資本報酬率門檻',
  nameEn: 'Ponzio CROIC Threshold',
  author: 'Joe Ponzio, 2009',
  sourceUrl: 'https://books.google.com/books?id=pCbrDQAAQBAJ&pg=PT118',
  summary: '近四季自由現金流除以投入資本在 10% 以上，達到 Joe Ponzio 在《F Wall Street》書中寫的個人偏好水準。',
  detail:
    'Joe Ponzio 在 2009 年出版的價值投資書《F Wall Street》中，用 CROIC（現金投入資本報酬率）衡量公司每投入一元資本能產生多少現金，' +
    '並寫下他個人偏好 CROIC 在 10% 以上；他同時提醒，像 45% 這樣極高的 CROIC 很難長期維持。這是作者的個人偏好，書中沒有提出實證研究。' +
    'Ponzio 的算法是業主盈餘（大型穩定企業可用自由現金流近似）除以股東權益加長期負債，沒有扣除現金；這裡的分母是有息負債加權益再扣掉現金，' +
    '帳上現金多的公司，數值會比照他的算法高。',
  timeframe: 'TTM',
  threshold: {
    description: '≥ 10',
    thresholdLatex: '\\mathrm{CROIC} \\geq 10',
    note: 'Ponzio《F Wall Street》（2009）："Personally, I like to see CROIC above 10 percent." 書中沒有另外寫低端警戒數字。',
    denominator: 1,
    comparator: 'gte',
    value: 10,
  },
};
