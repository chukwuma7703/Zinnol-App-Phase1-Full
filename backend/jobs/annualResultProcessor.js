import Result from "../models/Result.js";
import AnnualResult from "../models/AnnualResult.js";
import Student from "../models/Student.js";
import { getIO } from "../config/socket.js";

const getGradePoint = (average) => {
  if (average >= 90) return "A+";
  if (average >= 80) return "A";
  if (average >= 70) return "B";
  if (average >= 60) return "C";
  if (average >= 50) return "D";
  if (average >= 40) return "E";
  return "F";
};

export const processAnnualResults = async (job) => {
  const { classroomId, session, requestedBy } = job.data;
  console.log(`Processing annual results for classroom ${classroomId}, session ${session}...`);

  const students = await Student.find({ classroom: classroomId });
  if (students.length === 0) {
    console.log(`No students found in classroom ${classroomId}. Job complete.`);
    return;
  }

  // Track students with only one term result
  let singleTermStudents = [];
  const annualResultOps = students.map(async (student) => {
    const termResults = await Result.find({
      student: student._id,
      session,
      status: "approved",
    }).sort({ term: 1 });

    if (termResults.length === 0) return null;

    if (termResults.length === 1) {
      singleTermStudents.push(student);
    }

    const cumulativeScore = termResults.reduce((sum, r) => sum + r.totalScore, 0);
    const sumOfAverages = termResults.reduce((sum, r) => sum + r.average, 0);
    const finalAverage = sumOfAverages / termResults.length;

    return AnnualResult.findOneAndUpdate(
      { student: student._id, session },
      {
        student: student._id,
        classroom: classroomId,
        session,
        termResults: termResults.map(r => r._id),
        cumulativeScore,
        finalAverage,
        gradePoint: getGradePoint(finalAverage),
      },
      { upsert: true, new: true }
    );
  });

  await Promise.all(annualResultOps);

  const allAnnualResults = await AnnualResult.find({ classroom: classroomId, session }).sort({ finalAverage: -1 });

  let position = 0;
  let lastAverage = -1;
  const positionUpdateOps = allAnnualResults.map(async (ar, index) => {
    if (ar.finalAverage !== lastAverage) {
      position = index + 1;
      lastAverage = ar.finalAverage;
    }
    ar.annualPosition = position;
    return ar.save();
  });

  await Promise.all(positionUpdateOps);

  const io = getIO();
  let alertMsg = `Annual results for session ${session} are ready!`;
  if (singleTermStudents.length > 0) {
    alertMsg += `\nNote: ${singleTermStudents.length} student(s) have annual results based on only one term. Please review their records for accuracy.`;
  }
  io.to(`user-${requestedBy}`).emit("jobComplete", {
    message: alertMsg,
  });
  console.log(`Finished processing annual results for classroom ${classroomId}.`);
};

