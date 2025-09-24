import asyncHandler from "express-async-handler";
import FeatureFlag from "../models/FeatureFlag.js";
import AppError from "../utils/AppError.js";

// A simple in-memory cache to reduce DB lookups for feature flags.
const flagCache = new Map();
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

/**
 * Middleware factory to check if a feature is enabled.
 * @param {string} featureName - The unique name of the feature to check.
 * @returns {Function} An Express middleware function.
 */
export const checkFeatureFlag = (featureName) => asyncHandler(async (req, res, next) => {
  const cachedFlag = flagCache.get(featureName);

  if (cachedFlag && cachedFlag.timestamp > Date.now() - CACHE_TTL) {
    if (cachedFlag.isEnabled) {
      return next();
    } else {
      return next(new AppError(`This feature (${featureName}) is currently disabled by the administrator.`, 503));
    }
  }

  const feature = await FeatureFlag.findOne({ name: featureName }).lean();

  if (!feature || !feature.isEnabled) {
    flagCache.set(featureName, { isEnabled: false, timestamp: Date.now() });
    return next(new AppError(`This feature (${featureName}) is currently disabled by the administrator.`, 503));
  }

  flagCache.set(featureName, { isEnabled: true, timestamp: Date.now() });
  return next();
});

/**
 * Clears the in-memory feature flag cache. Can be exposed via an admin route.
 */
export const clearFeatureFlagCache = () => {
    flagCache.clear();
    console.log("Feature flag cache cleared.");
};

