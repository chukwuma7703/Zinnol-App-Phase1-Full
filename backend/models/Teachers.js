import mongoose from "mongoose";

const teacherSchema = new mongoose.Schema({
  user: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
  subjects: [{ type: mongoose.Schema.Types.ObjectId, ref: "Subject" }],
}, { timestamps: true });

export default mongoose.model("Teacher", teacherSchema);
