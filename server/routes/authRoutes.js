const router = require("express").Router();

const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");

const User = require("../models/User");

router.post("/register", async (req, res) => {

  try {

    const { name, email, password } = req.body;

    const existingUser = await User.findByEmail(email);

    if (existingUser) {
      return res.status(400).json({
        message: "User already exists"
      });
    }

    const salt = await bcrypt.genSalt(10);

    const hashedPassword = await bcrypt.hash(password, salt);

    await User.create({
      name,
      email,
      password: hashedPassword
    });

    res.json({
      message: "User Registered Successfully"
    });

  } catch (error) {

    res.status(500).json({
      message: error.message
    });

  }

});

router.post("/login", async (req, res) => {

  try {

    const { email, password } = req.body;

    const user = await User.findByEmail(email);

    if (!user) {
      return res.status(400).json({
        message: "User not found"
      });
    }

    const validPassword = await bcrypt.compare(
      password,
      user.password
    );

    if (!validPassword) {
      return res.status(400).json({
        message: "Invalid Password"
      });
    }

    const token = jwt.sign(
      { id: user.id },
      process.env.JWT_SECRET
    );

    res.json({
      token,
      user: {
        id: user.id,
        name: user.name,
        email: user.email
      }
    });

  } catch (error) {

    res.status(500).json({
      message: error.message
    });

  }

});

module.exports = router;
