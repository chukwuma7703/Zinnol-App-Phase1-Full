import asyncHandler from 'express-async-handler';
import Joi from 'joi';
import OrgSettings from '../models/orgSettingsModel.js';
import { ok } from '../utils/ApiResponse.js';
import AppError from '../utils/AppError.js';

export const getOrgSettings = asyncHandler(async (req, res) => {
    const doc = await OrgSettings.findOne();
    if (!doc) return ok(res, { organizationName: 'Zinnol', supportEmail: 'support@example.com' }, 'Default settings');
    return ok(res, doc, 'Org settings');
});

export const updateOrgSettings = [
    asyncHandler(async (req, res, next) => {
        const schema = Joi.object({
            organizationName: Joi.string().trim().min(2).max(100).required(),
            supportEmail: Joi.string().email().required(),
        });
        const { error, value } = schema.validate(req.body);
        if (error) return next(new AppError(error.details?.[0]?.message || 'Invalid settings', 400));
        const { organizationName, supportEmail } = value;
        let doc = await OrgSettings.findOne();
        if (!doc) {
            doc = await OrgSettings.create({ organizationName, supportEmail, updatedBy: req.user?._id });
        } else {
            doc.organizationName = organizationName;
            doc.supportEmail = supportEmail;
            doc.updatedBy = req.user?._id;
            await doc.save();
        }
        return ok(res, doc, 'Org settings updated');
    })
];
