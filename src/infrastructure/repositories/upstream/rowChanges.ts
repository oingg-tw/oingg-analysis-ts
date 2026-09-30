import { mopsExportPrisma } from '@/infrastructure/prisma/mopsExportClient';
import { tpexExportPrisma } from '@/infrastructure/prisma/tpexExportClient';
import { twseExportPrisma } from '@/infrastructure/prisma/twseExportClient';
import type { UpstreamRowChangesPort } from '@/application/ports/upstreamChanges';
import type { UpstreamSource } from '@/domain/upstream/recomputeTargets';

// 三家 export.row_changes 同一個形狀（2026-09-30 四方談定：id, table_name, symbol, key jsonb, change_kind, changed_at），
// 用 id 讀、不用 changed_at（交易可見性會讓時間戳亂序）。tpex 依環境讀 DEV／PROD 那組連線（config 已選好）。
type RawRow = { table_name: string; symbol: string | null; key: Record<string, unknown> };

const clients = { mops: mopsExportPrisma, tpex: tpexExportPrisma, twse: twseExportPrisma } as const;

export const upstreamRowChanges: UpstreamRowChangesPort = {
  list: async (source: UpstreamSource, fromExclusive: bigint, toInclusive: bigint) => {
    const rows = await (clients[source] as unknown as { $queryRaw: <T>(q: TemplateStringsArray, ...v: unknown[]) => Promise<T> }).$queryRaw<RawRow[]>`
      SELECT table_name, symbol, key FROM "export"."row_changes" WHERE id > ${fromExclusive} AND id <= ${toInclusive} ORDER BY id`;
    return rows.map((r) => ({ source, tableName: r.table_name, symbol: r.symbol, key: r.key }));
  },
};
