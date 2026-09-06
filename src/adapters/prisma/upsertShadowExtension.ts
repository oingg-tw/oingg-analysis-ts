import { Prisma } from '#generated/analysis-client';
import { logger } from '@/shared/logger';
import { serializePrismaRow } from './serializePrismaRow';

const toAccessorName = (model: string): string => model.charAt(0).toLowerCase() + model.slice(1);

// updatedAt 是 @updatedAt 欄位，Prisma 每次 update 都會自動塞一個新的當下時間戳進
// args.update，即使其他業務欄位完全沒變——37 張表全部有這個欄位，若不排除會讓每一次
// upsert 都被誤判成「有變化」，去重邏輯形同虛設（實測驗證過這個現象，見對應測試）。
// computedAt 是 @default(now())（不是 @updatedAt），正常不會出現在 update 區塊，這裡一併
// 排除是防禦性寫法，避免萬一有指標把它也塞進 update 造成同樣的問題。
const AUDIT_TIMESTAMP_KEYS = new Set(['updatedAt', 'computedAt']);

// 型別感知的相等比較——previousRow（來自 findUnique）跟 update（呼叫端傳的純量值）對同一個
// 欄位常常是不同 JS 型別但代表同一個值：Decimal 欄位的舊值是 Prisma.Decimal 實例（序列化成
// 字串 "10.98"），但呼叫端寫入時給的是 number 10.98；DateTime 欄位的舊值是 Date 實例，
// 呼叫端可能傳 Date 也可能傳 ISO 字串。直接比較序列化後的 JSON 字串會把「型別不同、數值
// 相同」誤判成「有變化」（實測踩過這個坑，roeQuarterlyPct "10.98" vs 10.98），所以按可能
// 的型別分別用對的方式比較，而不是無腦字串比對。
const valuesEqual = (previousValue: unknown, updateValue: unknown): boolean => {
  if (previousValue === updateValue) return true;
  if (previousValue === null || previousValue === undefined) return updateValue === null || updateValue === undefined;
  if (updateValue === null || updateValue === undefined) return false;

  if (previousValue instanceof Prisma.Decimal || typeof updateValue === 'number') {
    try {
      return new Prisma.Decimal(previousValue as Prisma.Decimal.Value).equals(new Prisma.Decimal(updateValue as Prisma.Decimal.Value));
    } catch {
      return false;
    }
  }
  if (typeof previousValue === 'bigint' || typeof updateValue === 'bigint') {
    try {
      return BigInt(previousValue as bigint | string | number) === BigInt(updateValue as bigint | string | number);
    } catch {
      return false;
    }
  }
  if (previousValue instanceof Date || updateValue instanceof Date) {
    const toTime = (v: unknown) => (v instanceof Date ? v.getTime() : new Date(v as string).getTime());
    return toTime(previousValue) === toTime(updateValue);
  }
  if (Array.isArray(previousValue) && Array.isArray(updateValue)) {
    return previousValue.length === updateValue.length && previousValue.every((v, i) => valuesEqual(v, updateValue[i]));
  }
  return JSON.stringify(serializePrismaRow(previousValue)) === JSON.stringify(serializePrismaRow(updateValue));
};

// 目前 39 個 upsert 呼叫點的 update 區塊都是純量欄位賦值；遇到物件值（疑似 Prisma update
// operator，例如 { increment }，且不是上面已知會處理的 Date/Decimal）保守視為「有變化」
// 直接寫快照，不嘗試解析語意——寧可多寫一筆，不能因為誤判「沒變」漏記真正的變化。
const isChanged = (previousRow: Record<string, unknown>, update: Record<string, unknown>): boolean => {
  for (const key of Object.keys(update)) {
    if (AUDIT_TIMESTAMP_KEYS.has(key)) continue;
    const updateValue = update[key];
    if (updateValue !== null && typeof updateValue === 'object' && !Array.isArray(updateValue) && !(updateValue instanceof Date) && !(updateValue instanceof Prisma.Decimal)) {
      return true;
    }
    if (!valuesEqual(previousRow[key], updateValue)) return true;
  }
  return false;
};

// P0 止血：37 張指標結果表的 upsert 在真的覆蓋既有列之前，先把即將被蓋掉的舊值存進
// metric_upsert_shadow（見 schema.prisma 的說明）。全域套用在 $allModels（連 IndustryCode/
// MetricDefinition 這種非典型單一鍵 model 也一起攝影，好處是邏輯統一、以後新增第 38 張表
// 不用記得同步更新白名單）——MetricValue 天生不受影響，它的寫入邏輯（metricValueWriter.ts）
// 用 .create()/.update()，從不呼叫 .upsert()。
//
// 三段式設計，刻意讓「查舊值」跟「比對寫快照」各自獨立包 try/catch，中間夾著完全不受
// try/catch 保護的 query(args)：任何一段輔助邏輯出錯都只記 log，絕不能讓真正的 upsert
// 失敗或結果被汙染——這是這個功能最重要的安全要求，寧可漏記一筆快照，不能拖垮現有寫入。
export const upsertShadowExtension = Prisma.defineExtension((prisma) =>
  prisma.$extends({
    name: 'upsertShadow',
    query: {
      $allModels: {
        async upsert({ model, args, query }) {
          const accessor = toAccessorName(model);
          const where = (args as { where: Record<string, unknown> }).where;

          let previousRow: Record<string, unknown> | null = null;
          try {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any -- 動態存取 model accessor，型別系統無法在編譯期知道是哪個 model
            previousRow = await (prisma as any)[accessor].findUnique({ where });
          } catch (error) {
            logger.error({ err: error, model }, '[upsert-shadow]: 查詢舊值失敗，本次 upsert 不會產生影子快照，但不影響 upsert 本身。');
          }

          const result = await query(args);

          if (previousRow) {
            try {
              const update = (args as { update: Record<string, unknown> }).update;
              if (isChanged(previousRow, update)) {
                await prisma.metricUpsertShadow.create({
                  data: {
                    modelName: model,
                    primaryKey: serializePrismaRow(where) as Prisma.InputJsonValue,
                    previousRow: serializePrismaRow(previousRow) as Prisma.InputJsonValue,
                  },
                });
              }
            } catch (error) {
              logger.error({ err: error, model }, '[upsert-shadow]: 寫入影子快照失敗，不影響本次 upsert 結果（已經正常回傳）。');
            }
          }

          return result;
        },
      },
    },
  }),
);
