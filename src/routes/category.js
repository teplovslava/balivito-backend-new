import { Router } from 'express';
import { getCategories } from '../controllers/category.js';

const router = Router();

router.get('/', getCategories);

export default router;
