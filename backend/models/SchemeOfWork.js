import mongoose from 'mongoose';

const lessonNoteSchema = new mongoose.Schema({
    teacher: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    content: { type: String, required: true },
    resources: [{ type: String }], // URLs or file identifiers
    createdAt: { type: Date, default: Date.now }
}, { _id: true });

const lessonReviewSchema = new mongoose.Schema({
    reviewer: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true }, // principal or admin
    status: { type: String, enum: ['pending', 'approved', 'rejected'], default: 'pending' },
    comments: { type: String },
    createdAt: { type: Date, default: Date.now }
}, { _id: true });

const lessonFeedbackSchema = new mongoose.Schema({
    parent: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    confirmation: { type: Boolean, default: false },
    comment: { type: String },
    createdAt: { type: Date, default: Date.now }
}, { _id: true });

const lessonSchema = new mongoose.Schema({
    scheme: { type: mongoose.Schema.Types.ObjectId, ref: 'SchemeOfWork', index: true },
    week: { type: Number, required: true },
    day: { type: Number, required: true },
    topic: { type: String, required: true },
    objectives: [{ type: String }],
    status: { type: String, enum: ['planned', 'in-progress', 'done'], default: 'planned', index: true },
    subject: { type: mongoose.Schema.Types.ObjectId, ref: 'Subject', required: true },
    classroom: { type: mongoose.Schema.Types.ObjectId, ref: 'Classroom', required: true },
    notes: [lessonNoteSchema],
    reviews: [lessonReviewSchema],
    feedback: [lessonFeedbackSchema],
}, { timestamps: true });

const schemeOfWorkSchema = new mongoose.Schema({
    school: { type: mongoose.Schema.Types.ObjectId, ref: 'School', required: true, index: true },
    subject: { type: mongoose.Schema.Types.ObjectId, ref: 'Subject', required: true, index: true },
    classroom: { type: mongoose.Schema.Types.ObjectId, ref: 'Classroom', required: true, index: true },
    session: { type: String, required: true },
    term: { type: Number, required: true },
    title: { type: String, required: true },
    description: { type: String },
    weeks: { type: Number, default: 12 },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    lessonsPlanned: { type: Number, default: 0 },
    lessonsCompleted: { type: Number, default: 0 },
}, { timestamps: true });

// Virtual progress percentage
schemeOfWorkSchema.virtual('progress').get(function () {
    if (this.lessonsPlanned === 0) return 0;
    return Math.round((this.lessonsCompleted / this.lessonsPlanned) * 100);
});

// Update counters on lesson save
lessonSchema.post('save', async function () {
    try {
        const Lesson = this.constructor;
        const Scheme = mongoose.model('SchemeOfWork');
        const schemeId = this.scheme;
        if (!schemeId) return;
        const counts = await Lesson.aggregate([
            { $match: { scheme: new mongoose.Types.ObjectId(schemeId) } },
            { $group: { _id: null, planned: { $sum: 1 }, completed: { $sum: { $cond: [{ $eq: ['$status', 'done'] }, 1, 0] } } } }
        ]);
        await Scheme.findByIdAndUpdate(schemeId, {
            lessonsPlanned: counts[0]?.planned || 0,
            lessonsCompleted: counts[0]?.completed || 0,
        });
    } catch (e) { /* swallow to not block lesson save */ }
});

export const Lesson = mongoose.model('Lesson', lessonSchema);
export default mongoose.model('SchemeOfWork', schemeOfWorkSchema);
