import bcrypt from "bcrypt";
import { randomBytes } from "crypto";
import jwt from "jsonwebtoken";
import User from "../models/User.js";
import { sendVerificationEmail } from "../utils/sendVerificationMail.js";
import { messages } from "../langs/auth.js";

// --- МУЛЬТИЯЗЫЧНЫЙ ХЕЛПЕР ---
function getErrorMessage(key, lang = "en") {
  return (messages[key] && messages[key][lang]) || (messages[key] && messages[key].en) || key;
}

const JWT_SECRET = process.env.JWT_SECRET;
const JWT_REFRESH_SECRET = process.env.JWT_REFRESH_SECRET;

const createTokens = (userId) => {
  const accessToken = jwt.sign({ id: userId }, JWT_SECRET, {
    expiresIn: "15m",
  });
  const refreshToken = jwt.sign({ id: userId }, JWT_REFRESH_SECRET, {
    expiresIn: "30d",
  });

  return { accessToken, refreshToken };
};

const setTokenCookies = (res, accessToken, refreshToken) => {
  res.cookie("token", accessToken, {
    httpOnly: true,
    sameSite: "Lax",
    maxAge: 1000 * 60 * 15,
  });

  res.cookie("refreshToken", refreshToken, {
    httpOnly: true,
    sameSite: "Lax",
    maxAge: 1000 * 60 * 60 * 24 * 30,
  });
};

export const register = async (req, res) => {
  const lang = req.language || 'en';
  try {
    const { email, password, name } = req.body;
    let userWasGuest = false;

    const existingUser = await User.findOne({ email });
    if (existingUser) {
      return res
        .status(409)
        .json({ message: getErrorMessage("user_exists", lang) });
    }

    const hashedPassword = await bcrypt.hash(password, 10);
    const verificationToken = randomBytes(32).toString("hex");

    const guestUser = await User.findById(req.userId);
    let finalUser;

    if (guestUser && guestUser.isGuest) {
      userWasGuest = true;
      guestUser.email = email;
      guestUser.name = name;
      guestUser.password = hashedPassword;
      guestUser.verificationToken = verificationToken;
      guestUser.isVerified = false;
      guestUser.isGuest = false;

      await guestUser.save();
      finalUser = guestUser;
    } else {
      const newUser = new User({
        email,
        name,
        password: hashedPassword,
        verificationToken,
        isVerified: false,
      });

      await newUser.save();
      finalUser = newUser;
    }

    try {
      await sendVerificationEmail(email, verificationToken);

      const { accessToken, refreshToken } = createTokens(finalUser._id);
      setTokenCookies(res, accessToken, refreshToken);

      res
        .status(201)
        .json({ message: getErrorMessage("registered_check_email", lang) });
    } catch (emailErr) {
      console.error("Ошибка отправки письма:", emailErr);

      if (!userWasGuest) await User.deleteOne({ email });
      res
        .status(500)
        .json({ message: getErrorMessage("email_send_error", lang) });
    }
  } catch (error) {
    console.error("Ошибка при регистрации:", error);
    res.status(500).json({ message: getErrorMessage("server_error", lang) });
  }
};

export const login = async (req, res) => {
  const lang = req.language || 'en';
  try {
    const { email, password } = req.body;

    const user = await User.findOne({ email });
    if (!user)
      return res.status(401).json({ message: getErrorMessage("invalid_credentials", lang) });

    const isPasswordValid = await bcrypt.compare(password, user.password);
    if (!isPasswordValid)
      return res.status(401).json({ message: getErrorMessage("invalid_credentials", lang) });

    if (!user.isVerified) {
      const verificationToken = randomBytes(32).toString("hex");
      user.verificationToken = verificationToken;
      await user.save();
      await sendVerificationEmail(email, verificationToken);
      return res
        .status(401)
        .json({ message: getErrorMessage("verify_email", lang) });
    }

    const { accessToken, refreshToken } = createTokens(user._id);
    setTokenCookies(res, accessToken, refreshToken);

    const { password: _, ...userData } = user.toObject();
    res.status(200).json({ user: userData });
  } catch (error) {
    console.error("Ошибка при входе:", error);
    res.status(500).json({ message: getErrorMessage("server_error", lang) });
  }
};

export const verifyEmail = async (req, res) => {
  const lang = req.language || 'en';
  try {
    const { email, token } = req.query;
    const user = await User.findOne({ email });

    if (!user) {
      return res.render("verify", {
        title: "Упс...",
        color: "red",
        message: getErrorMessage("user_not_found", lang),
      });
    }

    if (user.isVerified) {
      return res.render("verify", {
        title: "✅ Успех!",
        color: "#27ae60",
        message: getErrorMessage("email_already_verified", lang),
      });
    }

    const cooldown = 60 * 1000;
    const maxAttempts = 10;

    if (
      user.lastVerificationAttempt &&
      Date.now() - user.lastVerificationAttempt.getTime() < cooldown
    ) {
      return res.render("verify", {
        title: "Упс...",
        color: "red",
        message: getErrorMessage("too_many_attempts", lang),
      });
    }

    user.lastVerificationAttempt = new Date();
    user.verificationAttempts = (user.verificationAttempts || 0) + 1;

    if (user.verificationAttempts > maxAttempts) {
      user.verificationToken = undefined;
      await user.save();
      return res.render("verify", {
        title: "Упс...",
        color: "red",
        message: getErrorMessage("too_many_verif_attempts", lang),
      });
    }

    if (user.verificationToken === token) {
      user.isVerified = true;
      user.verificationToken = undefined;
      user.verificationAttempts = 0;
      user.lastVerificationAttempt = null;
      await user.save();

      return res.render("verify", {
        title: "✅ Успех!",
        color: "#27ae60",
        message: getErrorMessage("verification_success", lang),
      });
    }

    await user.save();
    return res.status(400).json({ message: getErrorMessage("invalid_verification_code", lang) });
  } catch (err) {
    console.error("Ошибка верификации:", err);
    res.status(500).json({ message: getErrorMessage("server_error", lang) });
  }
};

export const resendVerification = async (req, res) => {
  const lang = req.language || 'en';
  try {
    const { email } = req.body;

    const user = await User.findOne({ email: email.toLowerCase() });

    if (!user)
      return res.status(404).json({ message: getErrorMessage("user_not_found", lang) });
    if (user.isVerified)
      return res.status(400).json({ message: getErrorMessage("email_already_verified_2", lang) });

    const newToken = randomBytes(32).toString("hex");
    user.verificationToken = newToken;
    await user.save();

    await sendVerificationEmail(user.email, newToken);
    res.json({ message: getErrorMessage("resend_email_sent", lang) });
  } catch (err) {
    console.error("Ошибка отправки письма:", err);
    res.status(500).json({ message: getErrorMessage("server_error", lang) });
  }
};

export const refreshSession = async (req, res) => {
  const lang = req.language || 'en';
  try {
    const refreshToken = req.cookies.refreshToken;
    if (!refreshToken)
      return res.status(401).json({ message: getErrorMessage("no_refresh_token", lang) });

    const decoded = jwt.verify(refreshToken, process.env.JWT_REFRESH_SECRET);

    const newAccessToken = jwt.sign(
      { id: decoded.id },
      process.env.JWT_SECRET,
      { expiresIn: "15m" }
    );
    const newRefreshToken = jwt.sign(
      { id: decoded.id },
      process.env.JWT_REFRESH_SECRET,
      { expiresIn: "30d" }
    );

    res.cookie("token", newAccessToken, {
      httpOnly: true,
      sameSite: "Lax",
      maxAge: 1000 * 60 * 15,
    });

    res.cookie("refreshToken", newRefreshToken, {
      httpOnly: true,
      sameSite: "Lax",
      maxAge: 1000 * 60 * 60 * 24 * 30,
    });

    res.status(200).json({ message: getErrorMessage("tokens_refreshed", lang) });
  } catch (err) {
    console.error("Ошибка при refresh:", err);
    res.status(401).json({ message: getErrorMessage("invalid_refresh_token", lang) });
  }
};

export const logout = (req, res) => {
  const lang = req.language || 'en';
  res.clearCookie("token", {
    httpOnly: true,
    sameSite: "Lax",
    secure: true,
  });

  res.clearCookie("refreshToken", {
    httpOnly: true,
    sameSite: "Lax",
    secure: true,
  });

  res.status(200).json({ message: getErrorMessage("logged_out", lang) });
};
