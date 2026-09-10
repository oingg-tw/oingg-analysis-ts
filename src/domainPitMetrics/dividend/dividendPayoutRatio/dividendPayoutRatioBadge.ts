import type { MetricBadge } from '@/domainPitMetrics/metricDefinitionSpec';

// 2026-09-10 更正：threshold 原本寫「< 60%」是誤植（web-nuxt 轉來的原始資料也是這個版本），
// 實際去讀 Fidelity 這份文件的原文（Fruhan/Morrow/Hebard/Rahman, "Payout Ratio: The Most
// Influential Management Decision a Company Can Make?", Jan 2013）確認過：文件的結論是
// 「最適發放率區間是 40%–60%」，不是單邊「低於 60% 就安全」——論文明確指出過低（<40%）
// 代表公司沒有善用資本配置優勢，過高（尤其 >80%）則會被市場質疑股利可持續性、推升資金
// 成本，是一個雙邊區間論點，不是單邊安全上限。改用 'in_range' comparator（valueMin/
// valueMax）正確表達，不能硬套 lt/60 這種單邊比較。
export const dividendPayoutRatioBadge: MetricBadge = {
  id: 'dividend-payout-ratio-safety',
  name: 'Fidelity 股利發放率最適區間',
  nameEn: 'Fidelity Optimal Payout Ratio Range',
  author: 'Fruhan, Morrow, Hebard, Rahman, 2013',
  summary: '股利發放率落在 Fidelity 研究報告劃定的最適區間，兼顧資本配置紀律與股利永續性。',
  detail:
    '出自 Fidelity Investments 2013 年發布的投資人教育文件《Payout Ratio: The Most Influential Management' +
    ' Decision a Company Can Make?》：作者群分析 S&P 500 高品質子集後發現，股利發放率（現金股利 ÷ 稅後' +
    '淨利）落在 40%–60% 區間的公司，同時享有較低的權益成本（beta 較低）與較低的舉債成本（信用違約' +
    '交換利差較窄）。低於 40% 通常代表公司尚未充分運用資本配置這個槓桿；高於 80% 則市場開始質疑股利' +
    '可持續性，推升資金成本——是一個雙邊區間論點，不是「越低越安全」的單邊門檻。公用事業、REITs 等' +
    '高配息產業慣例上發放率本來就偏高，屬產業特性差異，不是絕對標準。這不是一個有專屬名稱的正式法則' +
    '（不像 Chowder Rule 那樣有具體命名），也不是單一學術論文，而是 Fidelity 這份研究報告提出的具體' +
    '區間建議。',
  token: 'TTM',
  threshold: {
    description: '40%–60%（Fidelity 研究報告劃定的最適發放率區間，不是單邊安全上限）',
    denominator: 1,
    comparator: 'in_range',
    valueMin: 40,
    valueMax: 60,
  },
};
