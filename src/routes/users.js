import { Router } from "express";
import {
  createUser,
  getAllUsers,
  updatePushToken,
} from "../controllers/user.js";
import { requireAuthorizedUser } from "../middlewares/auth.js";
import { userIdMiddleware } from "../middlewares/userId.js";

const router = Router();

router.get("/", getAllUsers);
router.post("/", createUser);
router.post(
  "/push-token",
  userIdMiddleware,
  requireAuthorizedUser,
  updatePushToken
);

export default router;
