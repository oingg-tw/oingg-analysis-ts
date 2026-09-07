import { describe, expect, it } from 'vitest';
import { resolveDailyCadenceKnowledgeDate } from '@/pitMetrics/knowledgeDate';

describe('resolveDailyCadenceKnowledgeDate', () => {
  it('knowledgeDate 直接等於 tradeDate，isFallback 恆為 false', () => {
    const tradeDate = new Date('2026-09-08');
    const result = resolveDailyCadenceKnowledgeDate(tradeDate);
    expect(result.knowledgeDate).toBe(tradeDate);
    expect(result.isFallback).toBe(false);
  });
});
