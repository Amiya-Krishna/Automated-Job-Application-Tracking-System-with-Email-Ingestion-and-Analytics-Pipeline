const router = require("express").Router();
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const { sendPasswordResetEmail } = require("../services/emailService");

const { PrismaClient, Prisma } = require("@prisma/client");
const prisma = new PrismaClient();

// REGISTER
router.post("/register", async (req, res) => {
  try {
    const { name, email, password } = req.body;

    // ✅ Check if user exists
    const existingUser = await prisma.user.findUnique({
      where: { email },
    });

    if (existingUser) {
      return res.status(400).json({
        message: "User already exists",
      });
    }

    // ✅ Hash password
    const hashedPassword = await bcrypt.hash(password, 10);

    // ✅ Create user
    await prisma.user.create({
      data: {
        name,
        email,
        password: hashedPassword,
      },
    });

    // ✅ Pre-fill the candidate profile (used by the extension's Profile tab
    // and the client's Profile page) with the name/email from registration,
    // so it doesn't show up blank the first time it's opened. This never
    // overwrites an existing profile someone has already filled in — it
    // only seeds a fresh one.
    try {
      const existingProfile = await prisma.user_profile.findFirst({
        orderBy: { id: "asc" },
      });

      if (!existingProfile) {
        await prisma.user_profile.create({
          data: { full_name: name, email },
        });
      }
    } catch (profileErr) {
      // Never fail registration because of the profile pre-fill step.
      console.error("Profile pre-fill failed:", profileErr.message);
    }

    res.status(201).json({
      message: "User Registered Successfully",
    });
  } catch (error) {
    // Prisma unique constraint fallback
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2002"
    ) {
      return res.status(400).json({
        message: "User already exists",
      });
    }

    res.status(500).json({
      message: error.message,
    });
  }
});

// LOGIN
router.post("/login", async (req, res) => {
  try {
    const { email, password } = req.body;

    // ✅ Find user
    const user = await prisma.user.findUnique({
      where: { email },
    });

    if (!user) {
      return res.status(400).json({
        message: "User not found",
      });
    }

    // ✅ Compare password
    const validPassword = await bcrypt.compare(password, user.password);

    if (!validPassword) {
      return res.status(400).json({
        message: "Invalid Password",
      });
    }

    // ✅ Generate token
    const token = jwt.sign(
      { id: user.id },
      process.env.JWT_SECRET,
      { expiresIn: "7d" }
    );

    res.json({
      token,
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
      },
    });
  } catch (error) {
    res.status(500).json({
      message: error.message,
    });
  }
});

// FORGOT PASSWORD — sends a time-limited reset link to the user's email.
router.post("/forgot-password", async (req, res) => {
  try {
    const { email } = req.body;

    if (!email) {
      return res.status(400).json({ message: "Email is required" });
    }

    const user = await prisma.user.findUnique({ where: { email } });

    // Always respond with the same message whether or not the account
    // exists, so this endpoint can't be used to find out which emails
    // are registered.
    const genericMessage =
      "If an account exists for that email, a reset link has been sent.";

    if (!user) {
      return res.json({ message: genericMessage });
    }

    const resetToken = jwt.sign(
      { id: user.id, purpose: "password_reset" },
      process.env.JWT_SECRET,
      { expiresIn: "30m" }
    );

    const clientUrl = (process.env.CLIENT_URL || "").split(",")[0] || "";
    const resetUrl = `${clientUrl}/reset-password?token=${resetToken}`;

    await sendPasswordResetEmail({ to: user.email, resetUrl });

    res.json({ message: genericMessage });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// RESET PASSWORD — verifies the token from the email link and sets a new password.
router.post("/reset-password", async (req, res) => {
  try {
    const { token, password } = req.body;

    if (!token || !password) {
      return res.status(400).json({ message: "Token and new password are required" });
    }

    if (password.length < 6) {
      return res.status(400).json({ message: "Password must be at least 6 characters" });
    }

    let decoded;
    try {
      decoded = jwt.verify(token, process.env.JWT_SECRET);
    } catch (err) {
      return res.status(400).json({ message: "Reset link is invalid or has expired" });
    }

    if (decoded.purpose !== "password_reset") {
      return res.status(400).json({ message: "Reset link is invalid or has expired" });
    }

    const hashedPassword = await bcrypt.hash(password, 10);

    await prisma.user.update({
      where: { id: decoded.id },
      data: { password: hashedPassword },
    });

    res.json({ message: "Password has been reset. You can now log in." });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

module.exports = router;