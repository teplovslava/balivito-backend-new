import { Router } from 'express';
import { requireAuthorizedUser } from '../middlewares/auth';
import { compressImages, upload } from '../middlewares/upload';
import { uploadChatPhotos } from '../controllers/chat';

const router = Router();

router.post('/upload-photo', requireAuthorizedUser, upload.array('photos', 10), compressImages, uploadChatPhotos);

export default router;