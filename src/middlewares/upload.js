// middleware/upload.js
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import sharp from 'sharp';
import UploadedFile from '../models/UploadFile.js';

const tmpDir = 'tmp/';
const uploadDir = 'uploads/';

// Создание директорий, если их нет
if (!fs.existsSync(tmpDir)) fs.mkdirSync(tmpDir);
if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir);

// Настройка multer для временной загрузки
const storage = multer.diskStorage({
  destination: tmpDir,
  filename: (_, file, cb) => {
    const uniqueName = `${Date.now()}-${file.originalname}`;
    cb(null, uniqueName);
  },
});

export const upload = multer({ storage });

// Middleware сжатия и обработки изображений
export const compressImages = async (req, res, next) => {
  const userId = req.userId;

  if (!req.files || !req.files.length) {
    return next();
  }

  try {
    const compressedFiles = [];

    for (const file of req.files) {
      const compressedPath = path.join(uploadDir, file.filename);

      await sharp(file.path)
        .rotate()
        .webp({ quality: 60 }) // JPEG для теста
        .toFile(compressedPath);

      fs.unlinkSync(file.path); // удаляем временный файл

      compressedFiles.push({
        ...file,
        path: compressedPath,
        filename: file.filename,
      });
    }

    const uploadedFiles = await Promise.all(
      compressedFiles.map(async (file) => {
        const fileUrl = `${process.env.SITE_URL}/uploads/${file.filename}`;

        return await UploadedFile.create({
          uri: fileUrl,
          filename: file.filename,
          author: userId,
        });
      })
    );


    req.uploadedFiles = uploadedFiles;
    next();
  } catch (err) {
    console.error('❌ Ошибка при сжатии изображений:', err);
    res.status(500).json({ message: 'Ошибка при обработке изображений' });
  }
};
