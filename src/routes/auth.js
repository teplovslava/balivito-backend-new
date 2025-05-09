import { Router } from "express";
import {
  login,
  logout,
  refreshSession,
  register,
  resendVerification,
  verifyEmail,
} from "../controllers/auth.js";
import { verifyRateLimiter } from "../middlewares/rateLimiter.js";
import { validate } from "../middlewares/validate.js";
import { loginValidation, registerValidation } from "../validators/auth.js";

const router = Router();

router.post("/register", registerValidation, validate, register);
router.post("/login", loginValidation, validate, login);
router.get("/verify", verifyRateLimiter, verifyEmail);
router.post("/resend-verification", verifyRateLimiter, resendVerification);
router.post("/refresh", refreshSession);
router.post("/logout", logout);

export default router;
