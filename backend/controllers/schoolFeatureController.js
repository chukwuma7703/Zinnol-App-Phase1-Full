import asyncHandler from "express-async-handler";
import School from "../models/School.js";
import AppError from "../utils/AppError.js";

// Enable or disable all features for a school
export const setAllFeaturesForSchool = asyncHandler(async (req, res, next) => {
    const { schoolId } = req.params;
    const { enable } = req.body; // true to enable all, false to disable all

    const school = await School.findById(schoolId);
    if (!school) return next(new AppError("School not found", 404));

    // Get all feature names (could be static or from FeatureFlag collection)
    // For demo, let's use a static list:
    const allFeatures = [
        "student_management",
        "result_management",
        "exam_management",
        "notification",
        "calendar",
        "search",
        "map",
        // Add more features as needed
    ];

    allFeatures.forEach(f => school.features.set(f, !!enable));
    await school.save();

    res.json({ message: `All features have been ${enable ? "enabled" : "disabled"} for this school.`, features: school.features });
});

// Get all features for a school
export const getFeaturesForSchool = asyncHandler(async (req, res, next) => {
    const { schoolId } = req.params;
    const school = await School.findById(schoolId);
    if (!school) return next(new AppError("School not found", 404));
    res.json({ features: school.features });
});

// Set individual feature for a school
export const setFeatureForSchool = asyncHandler(async (req, res, next) => {
    const { schoolId, feature } = req.params;
    const { enable } = req.body;
    const school = await School.findById(schoolId);
    if (!school) return next(new AppError("School not found", 404));
    school.features.set(feature, !!enable);
    await school.save();
    res.json({ message: `Feature '${feature}' has been ${enable ? "enabled" : "disabled"} for this school.`, features: school.features });
});
