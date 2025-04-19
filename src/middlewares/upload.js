import multer from 'multer';
import path from 'path';
import fs from 'fs';
import sharp from 'sharp';

const tmpDir = 'tmp/';
const uploadDir = 'uploads/';

if (!fs.existsSync(tmpDir)) fs.mkdirSync(tmpDir);
if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir);

const storage = multer.diskStorage({
  destination: tmpDir,
  filename: (_, file, cb) => {
    const uniqueName = `${Date.now()}-${file.originalname}`;
    cb(null, uniqueName);
  },
});

export const upload = multer({ storage });

export const compressImages = async (req, res, next) => {
  if (!req.files || !req.files.length) return next();

  try {
    const compressedFiles = [];

    for (const file of req.files) {
      const compressedPath = path.join(uploadDir, file.filename);

      await sharp(file.path)
        .jpeg({ quality: 60 })
        .toFile(compressedPath);

      fs.unlinkSync(file.path);

      compressedFiles.push({
        ...file,
        path: compressedPath,
        filename: file.filename,
      });
    }

    req.files = compressedFiles;
    next();
  } catch (err) {
    console.error('Ошибка при сжатии изображений:', err);
    res.status(500).json({ message: 'Ошибка при обработке изображений' });
  }
};
