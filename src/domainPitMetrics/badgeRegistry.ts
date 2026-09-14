import type { MetricBadge } from './metricDefinitionSpec';

import { chowderNumberBadge } from './dividend/chowderNumber/chowderNumberBadge';
import { dividendPayoutRatioBadge } from './dividend/dividendPayoutRatio/dividendPayoutRatioBadge';
import { shareCountChangeRateBadge } from './dividend/shareCountChangeRate/shareCountChangeRateBadge';
import { cashConversionCycleBadge } from './efficiency/cashConversionCycle/cashConversionCycleBadge';
import { ruleOf40Badge } from './growth/ruleOf40/ruleOf40Badge';
import { sueBadge } from './growth/sue/sueBadge';
import { consecutiveProfitYearsBadge } from './profitability/consecutiveProfitYears/consecutiveProfitYearsBadge';
import { grossMarginBadge } from './profitability/grossMargin/grossMarginBadge';
import { netProfitMarginBadge } from './profitability/netProfitMargin/netProfitMarginBadge';
import { roeBadge } from './profitability/roe/roeBadge';
import { accrualsRatioBadge } from './quality/accrualsRatio/accrualsRatioBadge';
import { beneishMScoreBadge } from './quality/beneishMScore/beneishMScoreBadge';
import { piotroskiFScoreBadge } from './quality/piotroskiFScore/piotroskiFScoreBadge';
import { altmanZDoublePrimeScoreBadge } from './resilience/altmanZDoublePrimeScore/altmanZDoublePrimeScoreBadge';
import { altmanZScoreBadge } from './resilience/altmanZScore/altmanZScoreBadge';
import { currentRatioBadge } from './resilience/currentRatio/currentRatioBadge';
import { ohlsonOScoreBadge } from './resilience/ohlsonOScore/ohlsonOScoreBadge';
import { zmijewskiScoreBadge } from './resilience/zmijewskiScore/zmijewskiScoreBadge';
import { liveGrahamNumberBadge } from './valuation/liveGrahamNumber/liveGrahamNumberBadge';
import { livePegRatioBadge } from './valuation/livePegRatio/livePegRatioBadge';
import { ncavBadge } from './valuation/ncav/ncavBadge';
import { tobinsQBadge } from './valuation/tobinsQ/tobinsQBadge';

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
// <metricCode>Badge.ts 檔案本身位置不變（還是放在各自指標資料夾底下，跟大段 detail
// prose 文案綁在一起比較好找），只是不再被 Definition.ts import，改成這裡統一 import。
export const badgeRegistry: Record<string, MetricBadge> = {
  chowderNumber: chowderNumberBadge,
  dividendPayoutRatio: dividendPayoutRatioBadge,
  shareCountChangeRate: shareCountChangeRateBadge,
  cashConversionCycle: cashConversionCycleBadge,
  ruleOf40: ruleOf40Badge,
  sue: sueBadge,
  consecutiveProfitYears: consecutiveProfitYearsBadge,
  grossMargin: grossMarginBadge,
  netProfitMargin: netProfitMarginBadge,
  roe: roeBadge,
  accrualsRatio: accrualsRatioBadge,
  beneishMScore: beneishMScoreBadge,
  piotroskiFScore: piotroskiFScoreBadge,
  altmanZDoublePrimeScore: altmanZDoublePrimeScoreBadge,
  altmanZScore: altmanZScoreBadge,
  currentRatio: currentRatioBadge,
  ohlsonOScore: ohlsonOScoreBadge,
  zmijewskiScore: zmijewskiScoreBadge,
  liveGrahamNumber: liveGrahamNumberBadge,
  livePegRatio: livePegRatioBadge,
  ncav: ncavBadge,
  tobinsQ: tobinsQBadge,
};

export const getBadgeForMetric = (metricCode: string): MetricBadge | undefined => badgeRegistry[metricCode];
