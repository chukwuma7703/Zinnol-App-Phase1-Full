import mongoose from "mongoose";

const keywordSchema = new mongoose.Schema({
  text: {
    type: String,
    required: true,
    lowercase: true,
    trim: true,
  },
  marks: {
    type: Number,
    required: true,
    min: 0.5,
  },
});

const questionSchema = new mongoose.Schema({
  exam: { type: mongoose.Schema.Types.ObjectId, ref: "Exam", required: true },
  questionText: { type: String, required: true },
  questionType: {
    type: String,
    enum: ["objective", "theory", "fill-in-the-blank"],
    required: true,
  },
  marks: { type: Number, required: true, min: 1 },

  // --- For 'objective' type ---
  options: [{ text: String }], // e.g., [{text: 'Paris'}, {text: 'London'}]
  correctOptionIndex: { type: Number }, // e.g., 0

  // --- For 'theory' type (The "Smart" part) ---
  keywords: [keywordSchema],

  // --- For 'fill-in-the-blank' type ---
  // An array to allow for multiple correct spellings or variations (e.g., "USA", "United States")
  correctAnswers: [{ type: String, trim: true }],
});

const Question = mongoose.model("Question", questionSchema);

export default Question;
