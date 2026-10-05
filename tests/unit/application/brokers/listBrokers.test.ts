import { expect, test } from 'vitest';
import { listBrokers } from '@/application/brokers/brokers';
import type { MarketListsPort } from '@/application/ports/marketLists';
import { createTestDeps } from '../../../fakes/createTestDeps';

test('名單照 repository 順序輸出、name 一律 null（來源沒有全名）、asOfDate 取最新 last_seen', async () => {
  const rows = [
    { broker_code: '1110', short_name: '台灣企銀', last_seen: new Date('2026-10-03T00:00:00Z') },
    { broker_code: '9800', short_name: '元大', last_seen: new Date('2026-10-04T00:00:00Z') },
  ];
  const deps = createTestDeps({ marketLists: { listActiveBrokers: async () => rows } as unknown as MarketListsPort });
  expect(await listBrokers(deps)).toEqual({
    asOfDate: '2026-10-04',
    brokers: [
      { brokerCode: '1110', name: null, shortName: '台灣企銀' },
      { brokerCode: '9800', name: null, shortName: '元大' },
    ],
  });
});
