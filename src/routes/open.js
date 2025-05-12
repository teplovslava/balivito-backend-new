import { Router } from "express";
import { openAd } from "../controllers/open";

const router = Router();

router.get("/", openAd);
