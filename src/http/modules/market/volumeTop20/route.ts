import { Router } from 'ultimate-express';
import { getVolumeTop20, type VolumeTop20Deps } from '@/application/market/volumeTop20/service';
import { jsonRoute } from '@/http/route';

export const createVolumeTop20Router = (deps: VolumeTop20Deps): Router => {
  const router = Router();
  router.get('/market/volume-top20', ...jsonRoute({}, () => getVolumeTop20(deps)));
  return router;
};
