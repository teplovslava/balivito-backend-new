import { Router } from 'express';
import { requireAuthorizedUser } from '../middlewares/auth.js';
import { compressImages, upload } from '../middlewares/upload.js';
import { deleteUploadedPhoto, uploadChatPhotos } from '../controllers/chat.js';

const router = Router();

router.post('/upload-photo', requireAuthorizedUser, upload.array('photos', 10), compressImages, uploadChatPhotos);
router.delete('/delete-photo/:id', requireAuthorizedUser, deleteUploadedPhoto);

export default router;