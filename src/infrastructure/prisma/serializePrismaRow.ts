import { Prisma } from '#generated/analysis-client';

export type JsonSafeValue = string | number | boolean | null | JsonSafeValue[] | { [key: string]: JsonSafeValue };

// 把 Prisma 回傳的一列資料（Decimal/BigInt/DateTime/String[]/Boolean/String/Int/null 的任意
// 組合）轉成能塞進 Prisma Json 欄位的純 JSON 值。獨立、遞迴、明確處理每種型別，不依賴
// JSON.stringify 對 toJSON 的隱式呼叫順序，方便單元測試每種型別的轉換規則。見
// upsertShadowExtension.ts 的說明——止血表要存 37 張指標表任意一列的完整快照。
export const serializePrismaRow = (value: unknown): JsonSafeValue => {
  if (value === null || value === undefined) return null;
  if (typeof value === 'bigint') return value.toString();
  if (value instanceof Prisma.Decimal) return value.toString();
  if (value instanceof Date) return value.toISOString();
  if (Array.isArray(value)) return value.map(serializePrismaRow);
  if (typeof value === 'object') {
    const out: { [key: string]: JsonSafeValue } = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) out[k] = serializePrismaRow(v);
    return out;
  }
  return value as string | number | boolean;
};
