import { Router } from "express";
import {
  createUser,
  getAllUsers,
  updatePushToken,
} from "../controllers/user.js";
import { requireAuthorizedUser } from "../middlewares/auth.js";

const router = Router();

router.get("/", getAllUsers);
router.post("/", createUser);
router.post("/push-token", requireAuthorizedUser, updatePushToken);

export default router;
