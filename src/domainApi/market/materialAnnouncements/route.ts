import { Router } from 'ultimate-express';
import { getMaterialAnnouncements } from './controller';

const router = Router();

router.get('/market/material-announcements', getMaterialAnnouncements);

export default router;
