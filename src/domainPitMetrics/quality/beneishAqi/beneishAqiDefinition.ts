import type { MetricDefinitionSpec } from '@/domainPitMetrics/metricDefinitionSpec';

// 2026-09-13：從 beneishMScore 8 個變量裡曝露出來的第一支——AQI（資產品質指數）本身
// 只用資產負債表科目就算得出來，不需要等其餘 7 個變量到齊，所以獨立成一支 metric_code
// 有實際意義（可以比 mScore 本身有更高的可用覆蓋率）。計算邏輯見
// beneishMScore/computeBeneishMScorePit.ts 的 resolveBeneishMScoreInputs()，這裡純粹
// 是另開一支 metric_code 寫入同一份算出來的 AQI 值，不重新推導公式。
export const beneishAqiDefinition: MetricDefinitionSpec = {
  metricCode: 'beneishAqi',
  name: '資產品質指數',
  nameEn: 'Asset Quality Index (AQI)',
  unit: '倍',
  formulaNote:
    '本期「非流動、非固定資產佔總資產比率」÷ 去年同期同一比率。非流動、非固定資產 = ' +
    '總資產 − 流動資產 − 不動產廠房設備，代表無形資產、遞延費用這類較難查核的資產項目。' +
    'AQI 越高代表這類資產佔比較去年同期上升，可能是把原本該費用化的支出不當資本化。' +
    '去年同季座標比照 beneishMScore/piotroskiFScore 用 getPastNQuarters({rocYear,season},5)[0]。' +
    '只有 Q 一種 basis。',
  formulaLatex: '\\mathrm{AQI} = \\frac{(\\mathrm{Assets} - \\mathrm{CurrentAssets} - \\mathrm{PPE})/\\mathrm{Assets}}{(\\mathrm{Assets}_{-4} - \\mathrm{CurrentAssets}_{-4} - \\mathrm{PPE}_{-4})/\\mathrm{Assets}_{-4}}',
  academicSourceUrl: 'https://doi.org/10.2469/faj.v55.n5.2296',
  referenceUrl: 'https://en.wikipedia.org/wiki/Beneish_M-score',
  tier: 'derived',
  sources: ['公開發行公司資產負債表（XBRL）'],
  group: 'period',
  allowedPeriodTypes: ['Q'],
  dependsOn: ['assets', 'current_assets', 'property_plant_and_equipment'],
  currentFormulaVersion: 1,
};
