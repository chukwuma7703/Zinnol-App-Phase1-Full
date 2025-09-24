import asyncHandler from "express-async-handler";
import FeatureFlag from "../models/FeatureFlag.js";
import AppError from "../utils/AppError.js";
import { clearFeatureFlagCache } from "../middleware/featureFlagMiddleware.js";

/**
 * @desc    Get all feature flags and their status.
 * @route   GET /api/features
 * @access  Global Super Admin
 */
export const getAllFeatureFlags = asyncHandler(async (req, res) => {
  const features = await FeatureFlag.find({}).sort({ name: 1 });
  res.json(features);
});

/**
 * @desc    Toggle a feature flag on or off.
 * @route   PATCH /api/features/:name/toggle
 * @access  Global Super Admin
 */
export const toggleFeatureFlag = asyncHandler(async (req, res, next) => {
  const feature = await FeatureFlag.findOne({ name: req.params.name });

  if (!feature) {
    return next(new AppError("Feature not found.", 404));
  }

  if (feature.isCore && feature.isEnabled) {
      return next(new AppError("This is a core system feature and cannot be disabled.", 400));
  }

  feature.isEnabled = !feature.isEnabled;
  await feature.save();

  // Clear the cache to ensure the change is reflected immediately across the app
  clearFeatureFlagCache();

  res.json({
    message: `Feature '${feature.name}' has been ${feature.isEnabled ? 'enabled' : 'disabled'}.`,
    feature,
  });
});

