import type { MetricBadge } from './metricDefinitionSpec';

import { dividendPayoutRatioBadge } from './dividend/dividendPayoutRatio/dividendPayoutRatioBadge';
import { epsCagr3yBadge } from './growth/epsCagr/epsCagr3yBadge';
import { sgrBadge } from './growth/sgr/sgrBadge';
import { grossMarginBadge } from './profitability/grossMargin/grossMarginBadge';
import { oneDollarTestBadge } from './profitability/oneDollarTest/oneDollarTestBadge';
import { netProfitMarginBadge } from './profitability/netProfitMargin/netProfitMarginBadge';
import { roeBadge } from './profitability/roe/roeBadge';
import { beneishMScoreBadge } from './quality/beneishMScore/beneishMScoreBadge';
import { piotroskiFScoreBadge } from './quality/piotroskiFScore/piotroskiFScoreBadge';
import { altmanZDoublePrimeScoreBadge } from './resilience/altmanZDoublePrimeScore/altmanZDoublePrimeScoreBadge';
import { altmanZScoreBadge } from './resilience/altmanZScore/altmanZScoreBadge';
import { bankCarRatioBadge } from './resilience/bankCarRatio/bankCarRatioBadge';
import { bankCet1RatioBadge } from './resilience/bankCet1Ratio/bankCet1RatioBadge';
import { bankTier1RatioBadge } from './resilience/bankTier1Ratio/bankTier1RatioBadge';
import { currentRatioBadge } from './resilience/currentRatio/currentRatioBadge';
import { longTermDebtToNetCurrentAssetsBadge } from './resilience/longTermDebtToNetCurrentAssets/longTermDebtToNetCurrentAssetsBadge';
import { ohlsonOScoreBadge } from './resilience/ohlsonOScore/ohlsonOScoreBadge';
import { zmijewskiScoreBadge } from './resilience/zmijewskiScore/zmijewskiScoreBadge';
import { liveGrahamNumberBadge } from './valuation/liveGrahamNumber/liveGrahamNumberBadge';
import { livePegRatioBadge } from './valuation/livePegRatio/livePegRatioBadge';
import { ncavBadge } from './valuation/ncav/ncavBadge';
import { tobinsQBadge } from './valuation/tobinsQ/tobinsQBadge';
import { psrBadge } from './valuation/psr/psrBadge';
import { epsGrowthRateBadge } from './growth/epsGrowthRate/epsGrowthRateBadge';

// 2026-09-14 應使用者要求，取代原本 MetricDefinitionSpec.badge?: MetricBadge（內嵌在各自
// <metricCode>Definition.ts 裡）的做法——那個設計把「這支指標怎麼算」（客觀事實，
// Definition 的職責）跟「哪個投資流派用什麼門檻給它掛徽章」（主觀策展）混在同一個物件裡。
// 改成這份獨立登錄檔（Record<metricCode, MetricBadge>）之後：
//   1. 調整/新增徽章不用去動 Definition 檔案（公式/dependsOn/allowedPeriodTypes 這些
//      計算相關的宣告），策展內容獨立維護。
//   2. evaluateCompanyBadges.ts（GET /companies/:symbol/badges）跟
//      metricFolderCatalog.ts（GET /metrics）都改讀這份登錄檔，不再讀 definition.badge。
//
// 維持單一 badge（不是陣列）——一個 metricCode 還是最多一個徽章，跟原本行為一致，這次
// 只是搬家，不是擴充成多對一。
//
// 2026-09-20 使用者要求逐支查證「門檻是否真的在該出處被提到具體數字」，下架 5 支門檻沒有
// 真出處的徽章（門檻數字是本站自訂，不是引用來源本身給出的）：
//   - shareholderYieldBadge：5% 門檻不是 Mebane Faber 的方法（Faber 原始做法是全市場排名
//     前十分位，comment 裡當時就承認這不是精確數字）。
//   - accrualsRatioBadge：±10% 門檻不是 Richard Sloan 論文的數字（Sloan 原始論文用十分位
//     排序法，comment 裡當時就承認這不是精確數字）。
//   - shareCountChangeRateBadge：Charlie Munger 的「食人族」是質性描述，從未訂過量化門檻，
//     「<0%」是本站自訂的機械式定義，跟 Munger 本人無關。
//   - cashConversionCycleBadge：Michael Dell 是商業案例（直銷模式），不是發表門檻的人，
//     「<0」是本站自訂的機械式定義，跟 Dell 本人無關。
//   - ohlsonOScoreBadge：0.5 不是 Ohlson (1980) 論文推薦的判別線——查證後確認 Ohlson 自己
//     的論文因為破產樣本比例失真，建議的最適切點遠低於 0.5（個位數百分比），0.5 只是邏輯
//     迴歸的數學中點，不是論文本身的建議值。
// 這 5 支指標本身（metricCode）繼續存在、繼續可計算、繼續看得到數值，只是不再附掛徽章/
// 門檻判定。同性質但查證後沒問題的 zmijewskiScoreBadge 予以保留（0.5 確實是 Zmijewski
// 論文本身處理過抽樣偏誤後仍採用的慣例切點，跟 Ohlson 情況不同）。
//
// 2026-09-20 第二輪：使用者把標準拉高到「必須有單一可指名的出處」，再下架 5 支：
//   - sueBadge：門檻「> 2」查證後確認 Foster/Olsen/Shevlin (1984)、Bernard/Thomas (1989)
//     兩篇論文用的都是十分位排序法（比較最高分位 vs 最低分位的報酬差），論文本身從未訂過
//     這種絕對切點，跟第一輪的 accrualsRatio/shareholderYield 是同一種問題。
//   - chowderNumberBadge/dividendCoverageRatioBadge/fcfConversionRateBadge/
//     ocfToNetIncomeBadge：門檻誠實標註為「業界慣例」而非掛某個學者名字，沒有假造出處，
//     但也找不到單一可指名的文獻明確給出這個數字（12%/2倍/80%/1倍分別是社群/傳統/顧問業
//     教材裡廣泛流傳的慣例值，不是某篇論文或某本書的精確引用），不符合「單一可指名出處」
//     的新標準。
// 查證後確認沒問題、保留的對照組：livePegRatio 的「< 1」——Peter Lynch 在《One Up on Wall
// Street》裡確實明講 PEG 在 1.0 附近代表合理定價、低於 1.0 代表可能低估，這個數字是他本人
// 真的說的（雖然他同時強調不是絕對二分線），符合單一可指名出處的標準，不下架。
//
// 2026-09-20 第三輪：使用者說「有疑慮就拿掉，現在要做的就是資料收斂」，再下架 2 支：
//   - ruleOf40Badge：查證發現「Rule of 40」的「40」這個數字根本不是 Brad Feld 提出的——他
//     只是跟 Fred Wilson 在 2015 年一起把某位「不具名的晚期投資人」在董事會上講的說法寫成
//     部落格文章推廣出去，真正的原始提出者是誰、哪一年提出都無法考證。「author: Brad Feld」
//     等於把一個真正匿名起源的規則掛在一個只是「推廣者」的名字底下，不符合單一可指名出處
//     的標準（不是「數字錯了」，是「根本沒有可指名的原始提出者」）。
//   - psrBadge：門檻 0.75/1.5/3-6 倍宣稱出自 Kenneth Fisher《Super Stocks》(1984)，多次
//     上網查證都只找到「Fisher 用 PSR 選股」這個方法論本身的引用，找不到任何獨立來源逐字
//     引用這三個具體數字——無法排除是本站或某個二手轉述來源自己加上去的門檻，查無法確認
//     真偽，保守起見直接下架。
//
// 2026-09-20 第六輪：ohlsonOScoreBadge 掛回。使用者放寬標準：門檻不必是原始出處規定的數字，只要有
// 學術論文設定過、設定方不是本平台即可。改引用廖彥傑（2023，台大財金所碩士論文）對台灣上市櫃公司
// 採用的 0.5 判別線，全文 PDF 已實際讀過確認逐字有寫。完整脈絡見 ohlsonOScoreBadge.ts 檔頭。
// 這條放寬標準之後也適用其他徽章：找不到原始出處的門檻時，可以引用有明確設定門檻的（台灣）學術
// 論文，但一樣要實際讀到那句話才算數。同一輪依此把 psrBadge 也掛回（張光廷，高應大金融資訊所
// 碩士論文，摘要逐字採用 Fisher 的 0.75/1.5/3.0 分界並引用《超級強勢股》譯本，見該檔檔頭）。
//
// 2026-09-20 第五輪：consecutiveProfitYearsBadge（Graham 獲利穩定性，≥10 年）下架——不是出處問題
// （Graham 第 14 章的 10 年門檻真實可查、sourceUrl 也驗過），是資料深度問題：全市場季報型指標
// 歷史只回填到 113Q1（2024Q1），只有 2330 有完整歷史（見 project_history_backfill_depth），一個
// 「連續 10 年獲利」的門檻對幾乎所有公司都只會落在 insufficient_history，徽章等於永遠不亮，
// 掛著只會讓使用者以為「這家公司不合格」。指標本身（consecutiveProfitYears）保留，數值照算；
// 之後歷史回填往前補到 10 年以上再考慮重新掛回來。
//
// <metricCode>Badge.ts 檔案本身位置不變（還是放在各自指標資料夾底下，跟大段 detail
// prose 文案綁在一起比較好找），只是不再被 Definition.ts import，改成這裡統一 import。
export const badgeRegistry: Record<string, MetricBadge> = {
  dividendPayoutRatio: dividendPayoutRatioBadge,
  epsCagr3y: epsCagr3yBadge,
  sgr: sgrBadge,
  grossMargin: grossMarginBadge,
  oneDollarTest: oneDollarTestBadge,
  netProfitMargin: netProfitMarginBadge,
  roe: roeBadge,
  beneishMScore: beneishMScoreBadge,
  piotroskiFScore: piotroskiFScoreBadge,
  altmanZDoublePrimeScore: altmanZDoublePrimeScoreBadge,
  altmanZScore: altmanZScoreBadge,
  bankCarRatio: bankCarRatioBadge,
  bankCet1Ratio: bankCet1RatioBadge,
  bankTier1Ratio: bankTier1RatioBadge,
  currentRatio: currentRatioBadge,
  longTermDebtToNetCurrentAssets: longTermDebtToNetCurrentAssetsBadge,
  ohlsonOScore: ohlsonOScoreBadge,
  zmijewskiScore: zmijewskiScoreBadge,
  liveGrahamNumber: liveGrahamNumberBadge,
  livePegRatio: livePegRatioBadge,
  ncav: ncavBadge,
  tobinsQ: tobinsQBadge,
  psr: psrBadge,
  epsGrowthRate: epsGrowthRateBadge,
};

export const getBadgeForMetric = (metricCode: string): MetricBadge | undefined => badgeRegistry[metricCode];
