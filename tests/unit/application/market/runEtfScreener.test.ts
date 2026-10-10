import { expect, test } from 'vitest';
import { runEtfScreener } from '@/application/market/etfScreener/service';
import { ValidationError } from '@/application/errors';
import { createTestDeps } from '../../../fakes/createTestDeps';

// 2026-10-11 market 改 MOPS TYPEK 後，舊值 TWSE 送進來要擋（400），不能 IN 比對不到、安靜回空清單。
test('選項固定的類別欄位收到選項外的值 → ValidationError；選項內的值照常通過驗證', async () => {
  const deps = createTestDeps();
  const request = (values: string[]) => ({ filters: [{ field: 'market', values }], columns: [], page: 1, pageSize: 50 });
  await expect(runEtfScreener(request(['TWSE']), deps)).rejects.toBeInstanceOf(ValidationError);
  await expect(runEtfScreener(request(['sii', 'maybe']), deps)).rejects.toThrow('收到不合法的值：maybe');
  await expect(runEtfScreener({ ...request([]), filters: [{ field: 'isActive', values: ['yes'] }] }, deps)).rejects.toBeInstanceOf(ValidationError);
});
