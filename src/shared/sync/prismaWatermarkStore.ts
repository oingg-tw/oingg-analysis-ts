import { analysisPrisma } from '@/adapters/prisma/analysisClient';
import type { WatermarkStore } from './types';

// WatermarkStore 的正式實作，讀寫 oingg-analysis DB 的 sync_state 表。
export const prismaWatermarkStore: WatermarkStore = {
  getWatermark: async (backend, dataset) => {
    const state = await analysisPrisma.syncState.findUnique({ where: { backend_dataset: { backend, dataset } } });
    return state?.lastCompletedAt ?? null;
  },
  setWatermark: async (backend, dataset, runId, completedAt) => {
    await analysisPrisma.syncState.upsert({
      where: { backend_dataset: { backend, dataset } },
      create: { backend, dataset, lastRunId: runId, lastCompletedAt: completedAt },
      update: { lastRunId: runId, lastCompletedAt: completedAt },
    });
  },
};
