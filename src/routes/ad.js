import { Router } from 'express';
import { archiveAd, createAd, deleteAd, getAdById, getAds, getMyAds, getRecommendedAds, getSearchSuggestions, unarchiveAd, updateAd } from '../controllers/ad.js';
import { createAdValidation } from '../validators/ad.js';
import { validate } from '../middlewares/validate.js';
import { compressImages, upload } from '../middlewares/upload.js';
import { requireAuthorizedUser } from '../middlewares/auth.js';

const router = Router();

router.post('/', requireAuthorizedUser, upload.array('photos', 15), compressImages, createAdValidation, validate, createAd);
router.get('/my', requireAuthorizedUser, getMyAds);
router.get('/all', getAds);
router.get('/recommended', getRecommendedAds)
router.get('/search', getSearchSuggestions)
router.delete('/delete/:id', requireAuthorizedUser, deleteAd);
router.patch('/:id', requireAuthorizedUser, upload.array('photos', 15), compressImages, createAdValidation, validate, updateAd);
router.get('/:id', getAdById);
router.patch('/:id/archive', requireAuthorizedUser, archiveAd);
router.patch('/:id/unarchive', requireAuthorizedUser, unarchiveAd);


export default router;
