import type { MetricBadge } from './metricDefinitionSpec';

import { chowderNumberBadge } from './dividend/chowderNumber/chowderNumberBadge';
import { dividendCoverageRatioBadge } from './dividend/dividendCoverageRatio/dividendCoverageRatioBadge';
import { dividendPayoutRatioBadge } from './dividend/dividendPayoutRatio/dividendPayoutRatioBadge';
import { epsCagr3yBadge } from './growth/epsCagr/epsCagr3yBadge';
import { ruleOf40Badge } from './growth/ruleOf40/ruleOf40Badge';
import { sgrBadge } from './growth/sgr/sgrBadge';
import { sueBadge } from './growth/sue/sueBadge';
import { consecutiveProfitYearsBadge } from './quality/consecutiveProfitYears/consecutiveProfitYearsBadge';
import { grossMarginBadge } from './profitability/grossMargin/grossMarginBadge';
import { oneDollarTestBadge } from './profitability/oneDollarTest/oneDollarTestBadge';
import { netProfitMarginBadge } from './profitability/netProfitMargin/netProfitMarginBadge';
import { roeBadge } from './profitability/roe/roeBadge';
import { fcfConversionRateBadge } from './quality/fcfConversionRate/fcfConversionRateBadge';
import { ocfToNetIncomeBadge } from './quality/ocfToNetIncome/ocfToNetIncomeBadge';
import { beneishMScoreBadge } from './quality/beneishMScore/beneishMScoreBadge';
import { piotroskiFScoreBadge } from './quality/piotroskiFScore/piotroskiFScoreBadge';
import { altmanZDoublePrimeScoreBadge } from './resilience/altmanZDoublePrimeScore/altmanZDoublePrimeScoreBadge';
import { altmanZScoreBadge } from './resilience/altmanZScore/altmanZScoreBadge';
import { bankCarRatioBadge } from './resilience/bankCarRatio/bankCarRatioBadge';
import { bankCet1RatioBadge } from './resilience/bankCet1Ratio/bankCet1RatioBadge';
import { bankTier1RatioBadge } from './resilience/bankTier1Ratio/bankTier1RatioBadge';
import { currentRatioBadge } from './resilience/currentRatio/currentRatioBadge';
import { longTermDebtToNetCurrentAssetsBadge } from './resilience/longTermDebtToNetCurrentAssets/longTermDebtToNetCurrentAssetsBadge';
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
// <metricCode>Badge.ts 檔案本身位置不變（還是放在各自指標資料夾底下，跟大段 detail
// prose 文案綁在一起比較好找），只是不再被 Definition.ts import，改成這裡統一 import。
export const badgeRegistry: Record<string, MetricBadge> = {
  chowderNumber: chowderNumberBadge,
  dividendCoverageRatio: dividendCoverageRatioBadge,
  dividendPayoutRatio: dividendPayoutRatioBadge,
  epsCagr3y: epsCagr3yBadge,
  ruleOf40: ruleOf40Badge,
  sgr: sgrBadge,
  sue: sueBadge,
  consecutiveProfitYears: consecutiveProfitYearsBadge,
  grossMargin: grossMarginBadge,
  oneDollarTest: oneDollarTestBadge,
  netProfitMargin: netProfitMarginBadge,
  roe: roeBadge,
  fcfConversionRate: fcfConversionRateBadge,
  ocfToNetIncome: ocfToNetIncomeBadge,
  beneishMScore: beneishMScoreBadge,
  piotroskiFScore: piotroskiFScoreBadge,
  altmanZDoublePrimeScore: altmanZDoublePrimeScoreBadge,
  altmanZScore: altmanZScoreBadge,
  bankCarRatio: bankCarRatioBadge,
  bankCet1Ratio: bankCet1RatioBadge,
  bankTier1Ratio: bankTier1RatioBadge,
  currentRatio: currentRatioBadge,
  longTermDebtToNetCurrentAssets: longTermDebtToNetCurrentAssetsBadge,
  zmijewskiScore: zmijewskiScoreBadge,
  liveGrahamNumber: liveGrahamNumberBadge,
  livePegRatio: livePegRatioBadge,
  ncav: ncavBadge,
  tobinsQ: tobinsQBadge,
  psr: psrBadge,
  epsGrowthRate: epsGrowthRateBadge,
};

export const getBadgeForMetric = (metricCode: string): MetricBadge | undefined => badgeRegistry[metricCode];
