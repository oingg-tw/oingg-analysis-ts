import type { MetricBadge } from './metricDefinitionSpec';

import { dividendPayoutRatioBadge } from './dividend/dividendPayoutRatio/dividendPayoutRatioBadge';
import { shareCountChangeRateBadge } from './dividend/shareCountChangeRate/shareCountChangeRateBadge';
import { sgrBadge } from './growth/sgr/sgrBadge';
import { threeMarginsRisingBadge } from './growth/threeMarginsRising/threeMarginsRisingBadge';
import { grossMarginBadge } from './profitability/grossMargin/grossMarginBadge';
import { novyMarxGpToAssetsBadge } from './profitability/novyMarxGpToAssets/novyMarxGpToAssetsBadge';
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
import { interestCoverageBadge } from './resilience/interestCoverage/interestCoverageBadge';
import { longTermDebtToNetCurrentAssetsBadge } from './resilience/longTermDebtToNetCurrentAssets/longTermDebtToNetCurrentAssetsBadge';
import { ohlsonOScoreBadge } from './resilience/ohlsonOScore/ohlsonOScoreBadge';
import { zmijewskiScoreBadge } from './resilience/zmijewskiScore/zmijewskiScoreBadge';
import { liveGrahamNumberBadge } from './valuation/liveGrahamNumber/liveGrahamNumberBadge';
import { livePegRatioBadge } from './valuation/livePegRatio/livePegRatioBadge';
import { ncavBadge } from './valuation/ncav/ncavBadge';
import { tobinsQBadge } from './valuation/tobinsQ/tobinsQBadge';
import { psrBadge } from './valuation/psr/psrBadge';

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
// 2026-09-20 第七輪：O'Neil 兩支合併。原本 epsCagr3yBadge（CAN SLIM 的 A，三年 EPS ≥25%）與
// epsGrowthRateBadge（C，當季 EPS ≥25%）各掛一半，是因為門檻型別無法表達「多個指標各自門檻同時
// 達成」。使用者要求合併成一支並補齊 O'Neil 原本就要求的另外兩條（當季營收 ≥25%、ROE ≥17%），
// 做法比照 piotroskiFScore：新增複合指標 oneilCanslimScore（0-4 分），徽章門檻 4/4。兩支舊徽章刪除，
// epsCagr3y/epsGrowthRate 指標本身不變。另外查核時發現 epsCagr3y 全市場只有 150/2067 家有值（三年
// CAGR 要四個完整年度，歷史只到 113Q1），舊徽章其實早就對 93% 公司亮不起來，跟第五輪拿掉
// consecutiveProfitYears 是同一種資料深度問題；合併後的複合指標同樣受限，使用者決定先讓 2330
// （有完整歷史）跑出來，其餘等回填。
//
// 2026-09-21：使用者決定 oneilCanslimScore 先移除不做——複合指標、compute、badge、metric_values
// 裡 2330 那 10 列全部下架/刪除，epsCagr3y/epsGrowthRate/revenueGrowthRate/roe 四支底層指標本身
// 不受影響。沒有恢復第七輪拿掉的那兩支舊徽章（同一份資料深度限制仍在，恢復也一樣點不亮）。之後
// 若要重做，上面第七輪的分析（四條門檻、資料深度現況）仍然有效，不用重查。
//
// 2026-09-21：shareCountChangeRateBadge 重新掛回，換了出處。原本 2026-09-14 用 Charlie Munger
// 的「cannibal」比喻（門檻 < 0%）在第一輪查證下架，因為 Munger 從未訂過量化數字。使用者提供
// oingg-conductor-ts 的一份股本食人族研究筆記，指出 Nasdaq US BuyBack Achievers Index（Invesco
// PKW 追蹤）方法論本身訂了「近四季淨減少流通股數 5% 以上」的量化門檻——這份研究筆記是二手彙整
// 不能直接採信，已直接 fetch 官方方法論 PDF（indexes.nasdaqomx.com/docs/Methodology_DRB.pdf）
// 逐字確認這句話在 Index Description 與 Security Eligibility Criteria 兩處一致出現，且 2013 年起
// 沿用至今。author 改掛 Nasdaq（真正訂門檻的機構），Munger 的比喻放進 detail 當背景說明，不再
// 當作者——完整脈絡見 shareCountChangeRateBadge.ts 檔頭。全市場資料深度已查過：139 筆 ≤ -5%、
// 覆蓋 48 家公司，不是打不亮的情況。
//
// 2026-09-21：threeMarginsRisingBadge（三率三升）新增，是「單一可指名出處」標準**唯一的明知例外**。
// 查證確認「三率三升」（毛利率/營業利益率/稅後淨利率同步上升）沒有單一可指名的原始提出者或機構——
// 是理財周刊、鉅亨網、商業周刊、Yahoo、豹投資等台灣財經媒體長期使用的慣用語，跟已下架的 Rule of 40
// （推廣者不是原始提出者）、shareholderYield 舊版（業界慣例找不到單一文獻）是同一種情況。使用者
// 已知情這個結論、仍明確要求破例放行（理由：使用頻率極高、對台灣使用者辨識度高），不是查證疏漏或
// 標準鬆動——**之後遇到其他同樣「找不到單一出處但很常用」的候選，不要拿這支當先例自動放行，每一支
// 都要重新請示使用者是否要破例**。author 誠實標「台灣財經媒體慣用語」不假冒任何個人/機構。新增指標
// 複合座標放在 growth（成長動能）分類，比照 piotroskiFScore/oneilCanslimScore 的「計分卡」模式：
// 三個比率各自「本季>上一季」且「本季>去年同季」（雙重驗證）才算一「升」，3/3 才算三率三升。
//
// 2026-09-21：interestCoverageBadge 新增。出處 Aswath Damodaran（紐約大學史登商學院教授）個人
// 網站維護的「利息保障倍數→信評等級」合成信評對照表，已實際 fetch 逐字確認數字存在，門檻取投資
// 等級（Baa2/BBB）下限 2.5 倍，弱端取 B2/B 下緣 1.5 倍。查過他網站上其餘資料集（產業別毛利率/
// 淨利率、負債結構、租賃調整）都是產業平均值統計不是分級門檻，這張利息保障倍數表是目前唯一符合
// 「比率對應到具體等級」條件的資料集，完整脈絡見 interestCoverageBadge.ts 檔頭。
//
// 2026-09-21：新增第六種門檻變體 threshold.percentileRank（跟同一批公司橫斷面排名比較，不是跟
// 固定常數）+ novyMarxGpToAssetsBadge 是第一個使用案例。動機：Novy-Marx（Gross Profitability）、
// O'Shaughnessy（Buyback Yield 十分位）這類出處的「高/低」本來就是十分位/五分位排名定義，不是
// 作者自己訂的絕對數字，之前因為型別只支援絕對常數比較被排除（見上面第二輪的分析），現在可以
// 忠實呈現原始方法論。novyMarxGpToAssetsBadge 已直接讀 Novy-Marx 個人網站免費公開的論文全文
// 逐字確認「quintile sort」「NYSE break points」「excludes financial firms」，scope 選 market
// （論文原文排名母體是全市場不分產業），完整脈絡見 novyMarxGpToAssetsBadge.ts 檔頭。之前被否決
// 的 O'Shaughnessy Buyback Yield/Sloan Accruals 十分位候選，理論上現在可以用這個新變體重新評估，
// 但每一支都要重新查證出處是否真的是「固定十分位/五分位」而非「作者自訂絕對數字」，不能自動放行。
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
  shareCountChangeRate: shareCountChangeRateBadge,
  sgr: sgrBadge,
  threeMarginsRising: threeMarginsRisingBadge,
  grossMargin: grossMarginBadge,
  novyMarxGpToAssets: novyMarxGpToAssetsBadge,
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
  interestCoverage: interestCoverageBadge,
  longTermDebtToNetCurrentAssets: longTermDebtToNetCurrentAssetsBadge,
  ohlsonOScore: ohlsonOScoreBadge,
  zmijewskiScore: zmijewskiScoreBadge,
  liveGrahamNumber: liveGrahamNumberBadge,
  livePegRatio: livePegRatioBadge,
  ncav: ncavBadge,
  tobinsQ: tobinsQBadge,
  psr: psrBadge,
};

export const getBadgeForMetric = (metricCode: string): MetricBadge | undefined => badgeRegistry[metricCode];
