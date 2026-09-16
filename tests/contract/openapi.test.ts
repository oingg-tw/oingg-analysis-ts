import { expect, test } from 'vitest';
import { buildOpenApiDocument } from '@/bootstrap/openapi';
import { httpModules } from '@/bootstrap/httpModules';

// 對外契約守門（clean architecture 重構 Phase 0）：/api-docs 產出的 OpenAPI 文件是 bff-ts
// 看到的全部契約（路徑、參數、回應 schema、狀態碼），整份 deep key-sort 之後跟
// openapi.snapshot.json 逐字比對——重構期間任何一個 commit 讓這份文件變了，就是契約變了。
// deep key-sort 讓 snapshot 對「路由註冊順序」跟「zod 欄位宣告順序」免疫（那兩個都會在
// 重構過程中合法地變動），只有 required/enum 這類陣列維持原序（欄位順序調整會顯示成小 diff，
// 可接受，那是唯一的雜訊來源）。servers 拿掉是因為 url 內嵌 config.port，隨環境變。
//
// 刻意的 API 變更：`pnpm test:contract:update` 更新 snapshot，diff 跟路由變更放同一個 commit
// 審閱，並通知 bff-ts。不需要 DB（import 只建構 Prisma client，不連線）。
const sortKeys = (value: unknown): unknown => {
  if (Array.isArray(value)) return value.map(sortKeys);
  if (value && typeof value === 'object') {
    const record = value as Record<string, unknown>;
    return Object.fromEntries(
      Object.keys(record)
        .sort()
        .map((key) => [key, sortKeys(record[key])])
    );
  }
  return value;
};

test('OpenAPI 文件（對外契約）跟 snapshot 一致', async () => {
  // port 只影響 servers（下面就拿掉），用固定值讓 spec 跟環境無關。
  const { servers: _servers, ...document } = buildOpenApiDocument(httpModules, { port: 3000 }) as unknown as Record<string, unknown>;
  await expect(JSON.stringify(sortKeys(document), null, 2)).toMatchFileSnapshot('./openapi.snapshot.json');
});
