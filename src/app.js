import express from 'express';
import cors from 'cors';
import path from 'path'
import { fileURLToPath } from 'url';
import cookieParser from 'cookie-parser';

import userRoutes from './routes/users.js';
import authRoutes from './routes/auth.js';
import adRoutes from './routes/ad.js';
import favoritesRoutes from './routes/favorites.js';
import feedbacksRoutes from './routes/feedbacks.js'
import categoryRoutes from './routes/category.js';
import locationRoutes from './routes/location.js';
import { userIdMiddleware } from './middlewares/userId.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();

app.use(cookieParser());
app.use(express.json());
app.use(cors());
app.use('/uploads', express.static(path.resolve('uploads')));
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));


app.use('/users', userRoutes);
app.use('/auth', authRoutes);
app.use('/ads', userIdMiddleware, adRoutes);
app.use('/favorites', userIdMiddleware, favoritesRoutes);
app.use('/feedbacks', userIdMiddleware, feedbacksRoutes);
app.use('/category', categoryRoutes);
app.use('/location', locationRoutes);

export default app;
