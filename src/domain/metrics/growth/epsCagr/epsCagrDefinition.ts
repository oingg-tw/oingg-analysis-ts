import type { MetricDefinitionSpec } from '@/domain/metrics/metricDefinitionSpec';

export const EPS_CAGR_YEARS = [3, 5, 8] as const;

const buildDefinition = (years: number): MetricDefinitionSpec => ({
  metricCode: `epsCagr${years}y`,
  folderName: 'epsCagr',
  name: `EPS ${years}年複合成長率`,
  unit: '%',
  formulaNote:
    `= (本年 EPS / ${years}年前 EPS)^(1/${years}) - 1，取「最近一個資料完整的完整會計年度」` +
    `跟「${years}年前的那個完整會計年度」，各自年度 EPS = (4 季淨利加總，歸屬母公司優先) / ` +
    '當年 Q4 報告日對應流通股數。本年或基期任一為 ≤0（虧損年度）→ zero_or_negative_denominator，' +
    '不產出變號扭曲值（負值開 N 次方根無意義）——跟原始定義「基期≤0 negative_denominator」' +
    '一致，但這裡額外把「本年為負」也擋下，理由是負值不只影響基期正確性，連 CAGR 公式本身' +
    '在數學上都無定義。只有 FY 一種 basis。',
  formulaLatex: `\\mathrm{EpsCagr}_{${years}y} = \\left(\\left(\\frac{\\mathrm{EPS}_t}{\\mathrm{EPS}_{t-${years}}}\\right)^{1/${years}} - 1\\right) \\times 100`,
  referenceUrl: 'https://zh.wikipedia.org/zh-tw/%E8%A4%87%E5%90%88%E5%B9%B4%E5%9D%87%E5%A2%9E%E9%95%B7%E7%8E%87',
  tier: 'derived',
  sources: ['公開發行公司損益表（XBRL）', '公開發行公司股本變動申報'],
  group: 'period',
  allowedPeriodTypes: ['FY'],
  dependsOn: ['profit_loss_attributable_to_owners_of_parent', 'profit_loss', 'paidInShares'],
  currentFormulaVersion: 1,
  // 2026-09-24 使用者決定 8 年窗口先從 GET /metrics 目錄下架：mops-ts 用 40 家等距採樣確認 **iXBRL 從民國
  // 108 年起才強制、107 年以前結構上就是舊格式 HTML**（採樣成功率 0/40），所以最早年度是 FY108，8 年窗口
  // 要 FY115 才滿——**約 2027 年初**才會出現第一個值，在那之前全市場 0 家有值，掛在目錄裡對使用者是雜訊。
  // **計算與儲存完全不動**（照常每季算、照常寫進 metric_values），只是不出現在目錄；時間到要掛回來就是
  // 把這個旗標拿掉，不用重算任何東西。3 年／5 年窗口不受影響。
  // 跟 dupontDecomposedRoe 用同一個機制（excludeFromFilterCatalog）。
  excludeFromFilterCatalog: years === 8,
});

export const epsCagrFamilyDefinitions: Record<string, MetricDefinitionSpec> = Object.fromEntries(
  EPS_CAGR_YEARS.map((years) => [`epsCagr${years}y`, buildDefinition(years)])
);
