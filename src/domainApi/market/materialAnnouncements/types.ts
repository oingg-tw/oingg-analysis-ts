import { z } from 'zod';

export const materialAnnouncementsQuerySchema = z.object({
  limit: z.number().meta({ description: '1~50，預設 20' }),
});
export type MaterialAnnouncementsQuery = z.infer<typeof materialAnnouncementsQuerySchema>;

export const materialAnnouncementRowSchema = z.object({
  symbol: z.string(),
  companyName: z.string().nullable(),
  announcementDate: z.string(),
  announcementTime: z.string().nullable().meta({ description: '原始字串格式（例如 "70003"），不是標準 HH:MM:SS' }),
  reportDate: z.string().nullable(),
  subject: z.string().nullable(),
  clause: z.string().nullable(),
  factDate: z.string().nullable(),
  description: z.string().nullable(),
});
export type MaterialAnnouncementRow = z.infer<typeof materialAnnouncementRowSchema>;

export const materialAnnouncementsResultSchema = z.object({
  limit: z.number(),
  items: z.array(materialAnnouncementRowSchema),
  warnings: z.array(z.string()),
});
export type MaterialAnnouncementsResult = z.infer<typeof materialAnnouncementsResultSchema>;
