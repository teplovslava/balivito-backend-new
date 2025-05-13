import { Router } from "express";
import { translate } from "../controllers/translate.js";

const router = Router();

router.post("/", translate);

export default router;
