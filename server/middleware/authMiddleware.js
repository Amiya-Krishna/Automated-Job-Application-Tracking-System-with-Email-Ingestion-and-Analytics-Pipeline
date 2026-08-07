const jwt = require("jsonwebtoken");

module.exports = function(req, res, next) {

  const token = req.header("token");

  if (!token) {
    return res.status(401).json({
      message: "No token, authorization denied"
    });
  }

  try {

    const verified = jwt.verify(
      token,
      process.env.JWT_SECRET
    );

    req.user = verified;

    next();

  } catch (err) {

    res.status(400).json({
      message: "Token is not valid"
    });

  }
};