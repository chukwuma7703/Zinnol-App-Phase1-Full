import mongoose from "mongoose";

const featureFlagSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
      unique: true,
      trim: true,
      index: true,
    },
    description: {
      type: String,
      required: true,
    },
    isEnabled: {
      type: Boolean,
      default: true,
    },
    isCore: {
      type: Boolean,
      default: false,
    },
  },
  { timestamps: true }
);

const FeatureFlag = mongoose.model("FeatureFlag", featureFlagSchema);
export default FeatureFlag;

