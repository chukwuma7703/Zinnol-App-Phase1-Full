import mongoose from 'mongoose';

const orgSettingsSchema = new mongoose.Schema({
    organizationName: { type: String, default: 'Zinnol' },
    supportEmail: { type: String, default: 'support@example.com' },
    updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
}, { timestamps: true });

export default mongoose.model('OrgSettings', orgSettingsSchema);
