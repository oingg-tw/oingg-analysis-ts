import { expect, test } from 'vitest';
import pino from 'pino';
import { LOG_REDACT_PATHS } from '@/infrastructure/logger';

// 2026-10-11 twse-ts 抓到 Cloud Logging 裡有金鑰明文：pino-http 的請求記錄是 { req: { headers } } 形狀，這裡用同一組遮蔽規則
// 寫一筆同形狀的 log，確認四個機密 header 都不會出現在輸出裡、其他 header 照常保留。
test('請求記錄裡的 authorization／x-upstream-key／x-api-key／cookie 會被遮掉，其他 header 照常', () => {
  const lines: string[] = [];
  const log = pino({ redact: { paths: LOG_REDACT_PATHS, censor: '[REDACTED]' } }, { write: (s: string) => lines.push(s) });
  log.info({ req: { headers: { authorization: 'Bearer secret-token', 'x-upstream-key': 'secret-upstream', 'x-api-key': 'secret-business', cookie: 'sid=secret', 'user-agent': 'twse-ts' } } }, 'request completed');
  const out = lines.join('');
  for (const secret of ['secret-token', 'secret-upstream', 'secret-business', 'sid=secret']) expect(out).not.toContain(secret);
  expect(JSON.parse(out).req.headers).toMatchObject({ authorization: '[REDACTED]', 'x-upstream-key': '[REDACTED]', 'user-agent': 'twse-ts' });
});
