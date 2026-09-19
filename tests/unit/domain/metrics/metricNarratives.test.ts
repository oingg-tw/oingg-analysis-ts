import { describe, expect, test } from 'vitest';
import { metricDefinitionRegistry } from '@/application/metrics/metricDefinitionRegistry';
import { badgeRegistry } from '@/domain/metrics/badgeRegistry';
import { metricNarrativeRegistry } from '@/domain/metrics/metricNarratives';

// 守住兩件事：(1) 文案的 key 一定是真實 metricCode（打錯字不會默默變成沒人讀的孤兒）；(2) 第一批承諾
// 「每支有徽章的指標都有三段文案」——之後新增徽章要一起補文案。三段都非空，避免前端渲染出空段落。

describe('metricNarrativeRegistry', () => {
  test('每個 key 都是 metricDefinitionRegistry 裡的 metricCode', () => {
    const unknown = Object.keys(metricNarrativeRegistry).filter((code) => !(code in metricDefinitionRegistry));
    expect(unknown).toEqual([]);
  });

  test('每支有徽章的指標都有文案', () => {
    const missing = Object.keys(badgeRegistry).filter((code) => !(code in metricNarrativeRegistry));
    expect(missing).toEqual([]);
  });

  test('三段文案都非空字串', () => {
    for (const [code, narrative] of Object.entries(metricNarrativeRegistry)) {
      expect(narrative.description.trim().length, `${code}.description`).toBeGreaterThan(0);
      expect(narrative.limitations.trim().length, `${code}.limitations`).toBeGreaterThan(0);
      expect(narrative.misreadings.trim().length, `${code}.misreadings`).toBeGreaterThan(0);
    }
  });
});
