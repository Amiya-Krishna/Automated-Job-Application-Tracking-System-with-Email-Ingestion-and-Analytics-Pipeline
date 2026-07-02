const mongoose = require("mongoose");

const userSchema = new mongoose.Schema({

  name: {
    type: String,
    required: true
  },

  email: {
    type: String,
    required: true,
    unique: true
  },

  password: {
    type: String,
    required: true
  },

  // Set only if the user connects Gmail. Used to fetch a fresh access
  // token when scanning their inbox for interview-related emails.
  gmailRefreshToken: {
    type: String,
    default: null
  }

});

module.exports = mongoose.model("User", userSchema);