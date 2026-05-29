const mongoose = require("mongoose");

const jobSchema = new mongoose.Schema({

  userId: {
    type: String,
    required: true
  },

  company: {
    type: String,
    required: true
  },

  role: {
    type: String,
    required: true
  },

  status: {
    type: String,
    default: "Applied"
  },

  interviewDate: {
    type: String
  },

  notes: {
    type: String
  }

}, { timestamps: true });

module.exports = mongoose.model("Job", jobSchema);