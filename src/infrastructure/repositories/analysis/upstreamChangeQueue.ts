import { analysisPrisma } from '@/infrastructure/prisma/analysisClient';
import type { UpstreamChangeQueuePort } from '@/application/ports/upstreamChanges';
import type { UpstreamSource } from '@/domain/upstream/recomputeTargets';

// application/ports/upstreamChanges.ts 的待辦表實作（analysis DB：upstream_change_notices、upstream_processor_leases，
// 見 prisma/analysis/migrations/*_upstream_change_notices）。全部 raw SQL：冪等入列與租約都要單一語句原子完成。
export const analysisUpstreamQueue: UpstreamChangeQueuePort = {
  enqueue: async (source, upToId, tables) => {
    const rows = await analysisPrisma.$queryRaw<{ id: bigint }[]>`
      INSERT INTO upstream_change_notices (source, up_to_id, tables)
      SELECT ${source}, ${upToId}, ${tables}::text[]
      WHERE NOT EXISTS (SELECT 1 FROM upstream_change_notices WHERE source = ${source} AND up_to_id >= ${upToId})
      ON CONFLICT (source, up_to_id) DO NOTHING
      RETURNING id`;
    return rows[0]?.id ?? null;
  },

  listPendingRanges: async () => {
    const rows = await analysisPrisma.$queryRaw<{ source: UpstreamSource; from_exclusive: bigint; to_inclusive: bigint }[]>`
      SELECT p.source,
        COALESCE((SELECT MAX(d.up_to_id) FROM upstream_change_notices d WHERE d.source = p.source AND d.status = 'done'), 0) AS from_exclusive,
        MAX(p.up_to_id) AS to_inclusive
      FROM upstream_change_notices p WHERE p.status = 'pending' GROUP BY p.source ORDER BY p.source`;
    return rows.map((r) => ({ source: r.source, fromExclusive: r.from_exclusive, toInclusive: r.to_inclusive }));
  },

  complete: async (source, toInclusive, summary) => {
    await analysisPrisma.$executeRaw`
      UPDATE upstream_change_notices SET status = 'done', processed_at = now(), summary = ${JSON.stringify(summary)}::jsonb
      WHERE source = ${source} AND status = 'pending' AND up_to_id <= ${toInclusive}`;
  },

  fail: async (source, toInclusive, error) => {
    await analysisPrisma.$executeRaw`
      UPDATE upstream_change_notices SET status = 'failed', processed_at = now(), error = ${error}
      WHERE source = ${source} AND status = 'pending' AND up_to_id <= ${toInclusive}`;
  },

  acquireLease: async (holder, ttlMinutes) => {
    const rows = await analysisPrisma.$queryRaw<{ ok: number }[]>`
      UPDATE upstream_processor_leases SET holder = ${holder}, expires_at = now() + make_interval(mins => ${ttlMinutes})
      WHERE id = 1 AND (expires_at < now() OR holder = ${holder})
      RETURNING 1 AS ok`;
    return rows.length === 1;
  },

  releaseLease: async (holder) => {
    await analysisPrisma.$executeRaw`UPDATE upstream_processor_leases SET expires_at = now() WHERE id = 1 AND holder = ${holder}`;
  },
};
