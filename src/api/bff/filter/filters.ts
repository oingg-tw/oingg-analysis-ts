import { Router, type Request, type Response } from 'ultimate-express';
import { scanMetricFolderCatalog } from './metricFolderCatalog';

const router = Router();

router.get('/filters', (req: Request, res: Response) => {
  res.json({ categories: scanMetricFolderCatalog() });
});

export default router;
