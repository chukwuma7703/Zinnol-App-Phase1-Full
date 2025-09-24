// Model for Buser Admin transactions (school items, payments, etc.)
import mongoose from 'mongoose';

const buserTransactionSchema = new mongoose.Schema({
    item: { type: String, required: true, trim: true }, // e.g., "Uniform", "Textbook"
    student: { type: mongoose.Schema.Types.ObjectId, ref: 'Student', required: true, index: true },
    parent: { type: mongoose.Schema.Types.ObjectId, ref: 'User' }, // Optional: The parent user associated with the student
    amount: {
        type: Number,
        required: true,
        min: [0.01, 'Transaction amount must be a positive number.'] // Ensure amount is positive
    },
    status: {
        type: String,
        enum: ['pending', 'approved', 'declined', 'paid'],
        default: 'pending',
        index: true
    },
    requestedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true }, // User who initiated the request
    approvedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' }, // Buser Admin who approved/declined
    school: { type: mongoose.Schema.Types.ObjectId, ref: 'School', required: true, index: true },
    paidAt: { type: Date },
}, {
    // Use Mongoose's built-in timestamps for automatic `createdAt` and `updatedAt`
    timestamps: true,
});

// Compound index for efficient querying of transactions by school and status
buserTransactionSchema.index({ school: 1, status: 1 });
// Useful index for user activity views
buserTransactionSchema.index({ requestedBy: 1, createdAt: -1 });

export default mongoose.model('BuserTransaction', buserTransactionSchema);
