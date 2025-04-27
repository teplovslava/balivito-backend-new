import { Router } from 'express';
import { archiveAd, createAd, deleteAd, getAdById, getAds, getMyAds, getRecommendedAds, getSearchSuggestions, unarchiveAd, updateAd } from '../controllers/ad.js';
import { createAdValidation } from '../validators/ad.js';
import { validate } from '../middlewares/validate.js';
import { authMiddleware } from '../middlewares/auth.js';
import { userIdMiddleware } from '../middlewares/userId.js';
import { compressImages, upload } from '../middlewares/upload.js';

const router = Router();

router.post('/', authMiddleware, upload.array('photos', 15), compressImages, createAdValidation, validate, createAd);
router.get('/my', authMiddleware, getMyAds);
router.get('/all',userIdMiddleware, getAds);
router.get('/recommended',userIdMiddleware, getRecommendedAds)
router.get('/search', getSearchSuggestions)
router.delete('/delete/:id', authMiddleware, deleteAd);
router.patch('/:id', authMiddleware,upload.array('photos', 15), compressImages, createAdValidation, validate, updateAd);
router.get('/:id', userIdMiddleware, getAdById);
router.patch('/:id/archive', authMiddleware, archiveAd);
router.patch('/:id/unarchive', authMiddleware, unarchiveAd);


export default router;
