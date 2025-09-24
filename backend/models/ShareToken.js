import mongoose from "mongoose";
import crypto from "crypto";

const shareTokenSchema = new mongoose.Schema(
  {
    // The unique, random token string for the shareable link
    token: {
      type: String,
      unique: true,
      index: true,
    },
    // What kind of data is being shared?
    type: {
      type: String,
      required: true,
      enum: ["student-analytics", "teacher-analytics"],
    },
    // The ID of the student or teacher being shared
    targetId: {
      type: mongoose.Schema.Types.ObjectId,
      required: true,
    },
    school: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "School",
      required: true,
    },
    expiresAt: {
      type: Date,
      required: true,
    },
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
  },
  { timestamps: true }
);

// Add a pre-save hook to generate a unique token
shareTokenSchema.pre("save", function (next) {
  if (this.isNew) {
    this.token = crypto.randomBytes(20).toString("hex");
  }
  next();
});

const ShareToken = mongoose.model("ShareToken", shareTokenSchema);
export default ShareToken;
