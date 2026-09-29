import { describe, expect, test } from 'vitest';
import { capWeightedMeanPercent, geometricMeanPercent, supplySideErpPercent } from '@/domain/macro/supplySideEquityRiskPremium';

// 釘住三件會安靜算錯的事：幾何平均不是算術平均、殖利率 0（不配息）要進分母但 null（沒資料）不進、ERP 是乘法複合不是相加。
describe('supplySideEquityRiskPremium', () => {
  test('幾何平均：+10% 再 −10% 不是 0', () => {
    expect(geometricMeanPercent([10, -10])).toBeCloseTo(-0.5013, 4); // √(1.1×0.9) − 1
    expect(geometricMeanPercent([])).toBeNull();
  });

  test('市值加權：0 殖利率算進去、null 排除並回報涵蓋率', () => {
    const result = capWeightedMeanPercent([
      { value: 2, weight: 300 },
      { value: 0, weight: 100 }, // 不配息，照算
      { value: null, weight: 100 }, // 沒資料，排除
      { value: 5, weight: null },
    ]);
    expect(result).toEqual({ mean: 1.5, count: 2, coveragePercent: 80 });
    expect(capWeightedMeanPercent([{ value: null, weight: 1 }])).toBeNull();
  });

  test('ERP = (1+i)(1+g) − 1 + Y − Rf', () => {
    // 1.0115 × 1.0421 − 1 = 5.4084%；+ 1.63 − 1.9
    expect(supplySideErpPercent(1.15, 4.21, 1.63, 1.9)).toBeCloseTo(5.1384, 4);
  });
});
