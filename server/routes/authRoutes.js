const router = require("express").Router();
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");

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

module.exports = router;