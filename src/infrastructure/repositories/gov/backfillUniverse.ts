import { govExportPrisma } from '@/infrastructure/prisma/govExportClient';

// 財政部稅籍分類 section='C'（製造業）、主要分類（rank=0）的公司——altmanZDoublePrimeScore 的製造業排除回填用，
// 2026-09-17 Phase 6 從 scripts/backfillZDoublePrimeManufacturingExclusionPit.ts 搬來（逐字）。
export const listManufacturingSymbols = (): Promise<{ symbol: string }[]> =>
  govExportPrisma.$queryRaw<{ symbol: string }[]>`
    SELECT DISTINCT symbol FROM "export"."company_industry_classification" WHERE section_code = 'C' AND rank = 0 ORDER BY symbol
  `;
