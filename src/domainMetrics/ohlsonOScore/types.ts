import type { MetricResultMeta } from '@/shared/metricStatus';
import type { QuarterlyMetricQuery, QuarterlyMetricIdentity, QuarterlyMetricTtmInfo } from '@/shared/quarterlyMetric';

// year/season 選填但要成對——不給就自動抓「這家公司資產負債表/損益表/現金流量表都有資料」的
// 最新一季（見 shared/sourceData/latestQuarter.ts），只給其中一個視為無效請求（在 controller 用 zod refine 擋掉）。
export type OhlsonOScoreQuery = QuarterlyMetricQuery;

export interface OhlsonOScoreResult extends QuarterlyMetricIdentity, MetricResultMeta {
  // James Ohlson（1980）Logit 財務危機預警模型：
  // O = -1.32 - 0.407*SIZE + 6.03*TLTA - 1.43*WCTA + 0.0757*CLCA - 1.72*OENEG
  //     - 2.37*NITA - 1.83*FUTL + 0.285*INTWO - 0.521*CHIN
  oScore: number | null;
  // probabilityOfBankruptcy = 1 / (1 + e^(-O))，Logit 模型的標準機率轉換，比單看 O 這個沒有
  // 直覺單位的分數好解讀。
  probabilityOfBankruptcy: number | null;
  // 門檻是原始論文定的，不是本服務自訂：probabilityOfBankruptcy > 0.5（等同 oScore > 0）判斷為
  // 財務危機風險較高。
  flagged: boolean | null;

  size: number | null; // ln(總資產)——原始論文用 GNP 物價指數平減過的資產，本服務用未平減的原始總資產，見下方說明
  tlta: number | null; // 總負債 / 總資產
  wcta: number | null; // (流動資產 - 流動負債) / 總資產
  clca: number | null; // 流動負債 / 流動資產
  oeneg: number | null; // 總負債 > 總資產 記 1，否則記 0（權益為負的訊號）
  nita: number | null; // 淨利（TTM） / 總資產
  futl: number | null; // 營運現金流（TTM，FFO 的代理變數） / 總負債
  intwo: number | null; // 今年、去年 TTM 淨利都是負數記 1，否則記 0
  chin: number | null; // (今年 TTM 淨利 - 去年 TTM 淨利) / (|今年| + |去年|)

  netIncomeTtm: { value: string | null }; // BigInt as string；本季往前 4 季（含本季）加總
  netIncomeTtmPriorYear: { value: string | null }; // BigInt as string；去年同季往前 4 季加總
  operatingCashFlowTtm: { value: string | null }; // BigInt as string；本季往前 4 季（含本季）加總
  totalAssets: { value: string | null };
  totalLiabilities: { value: string | null };
  currentAssets: { value: string | null };
  currentLiabilities: { value: string | null };

  ttm: QuarterlyMetricTtmInfo;
}
