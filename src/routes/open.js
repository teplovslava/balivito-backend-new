import { Router } from "express";
import { openAd } from "../controllers/open.js";

const router = Router();

router.get("/:id", openAd);

export default router;
