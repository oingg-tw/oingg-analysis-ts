import { Router } from 'ultimate-express';
import { listMaterialAnnouncements, type MaterialAnnouncementsDeps } from '@/application/market/materialAnnouncements/service';
import { jsonRoute } from '@/http/route';
import { getMaterialAnnouncementsQuerySchema } from './schemas';

export const createMaterialAnnouncementsRouter = (deps: MaterialAnnouncementsDeps): Router => {
  const router = Router();
  router.get('/market/material-announcements', ...jsonRoute({ query: getMaterialAnnouncementsQuerySchema }, ({ query }) => listMaterialAnnouncements(query, deps)));
  return router;
};
