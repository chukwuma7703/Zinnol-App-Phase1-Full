import mongoose from "mongoose";
import crypto from "crypto";

const refreshTokenSchema = new mongoose.Schema({
    user: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User",
        required: true,
    },
    // Legacy compatibility: some databases have a unique index on `token`.
    // We don't store plaintext tokens; to satisfy that index, mirror the hash into this field.
    token: {
        type: String,
        unique: true,
        // Mark as sparse to avoid uniqueness collisions if any doc somehow misses it
        sparse: true,
        select: false,
    },
    tokenHash: {
        type: String,
        required: true,
        unique: true,
    },
    expiresAt: {
        type: Date,
        required: true,
    },
    revoked: {
        type: Boolean,
        default: false,
    },
}, { timestamps: true });

// Ensure `token` is populated (mirrored) to satisfy legacy unique index on `token`
refreshTokenSchema.pre('validate', function (next) {
    if (!this.token && this.tokenHash) {
        this.token = this.tokenHash;
    }
    next();
});

refreshTokenSchema.statics.hashToken = function (token) {
    return crypto.createHash("sha256").update(token).digest("hex");
};

export default mongoose.model("RefreshToken", refreshTokenSchema);