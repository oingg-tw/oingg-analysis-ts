import { Router, type Request, type Response } from 'ultimate-express';
import { scanMetricFolderCatalog } from '@/application/metrics/metricFolderCatalog';

const router = Router();

router.get('/metrics', (req: Request, res: Response) => {
  res.json({ categories: scanMetricFolderCatalog() });
});

export default router;
