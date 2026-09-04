import { Router, type Request, type Response } from 'ultimate-express';
import { getStartupTime } from '@/shared/serverInfo';

const router = Router();

router.get('/', (req: Request, res: Response) => {
  const startupTime = getStartupTime();
  const startupMessage = startupTime !== null ? `Server startup time: ${startupTime.toFixed(2)}ms` : 'Startup time not yet available.';

  res.json({
    startupTime: startupMessage,
  });
});

export default router;
