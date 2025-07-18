import cookieParser from "cookie-parser";
import cors from "cors";
import express from "express";
import path from "path";
import { fileURLToPath } from "url";

import { userIdMiddleware } from "./middlewares/userId.js";
import adRoutes from "./routes/ad.js";
import authRoutes from "./routes/auth.js";
import categoryRoutes from "./routes/category.js";
import chatRoutes from "./routes/chat.js";
import favoritesRoutes from "./routes/favorites.js";
import reviewRoutes from "./routes/reviews.js";
import locationRoutes from "./routes/location.js";
import openRoutes from "./routes/open.js";
import translateRoutes from "./routes/translate.js";
import userRoutes from "./routes/users.js";
import { setLocale } from "./middlewares/setLocale.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();

app.use(cookieParser());
app.use(express.json());
app.use(cors());
app.use("/uploads", express.static(path.resolve("uploads")));
app.set("view engine", "ejs");
app.set("views", path.join(__dirname, "views"));

app.use(setLocale);

app.use("/user", userRoutes);
app.use("/auth", authRoutes);
app.use("/ads", userIdMiddleware, adRoutes);
app.use("/favorites", userIdMiddleware, favoritesRoutes);
app.use("/review", userIdMiddleware, reviewRoutes);
app.use("/category", categoryRoutes);
app.use("/location", locationRoutes);
app.use("/chat", userIdMiddleware, chatRoutes);
app.use("/open", openRoutes);
app.use("/translate", translateRoutes);

export default app;
