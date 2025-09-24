      $match: {
        student: new mongoose.Types.ObjectId(studentId),
        status: "marked",
      },
    },
    // 2. Join with the Exam collection to get exam title and subject
    {
      $lookup: {
        from: "exams",
        localField: "exam",
        foreignField: "_id",
        as: "examInfo",
        pipeline: [{ $project: { title: 1, subject: 1, totalMarks: 1 } }],
      },
    },
    { $unwind: "$examInfo" },
    // 3. Join with the Subject collection
    {
      $lookup: { from: "subjects", localField: "examInfo.subject", foreignField: "_id", as: "subjectInfo" },
    },
    { $unwind: "$subjectInfo" },
    // 4. Sort by session and term before grouping
    { $sort: { session: 1, term: 1 } },
    // 5. Group by session
    {
      $group: {
        _id: "$session",
        exams: {
          $push: {
            examId: "$examInfo._id",
            title: "$examInfo.title",
            term: "$term",
            subject: "$subjectInfo.name",
            score: "$totalScore",
            maxScore: "$examInfo.totalMarks",
            dateTaken: "$markedAt",
          },
        },
      },
    },
    // 6. Final sort and reshape the output
    { $sort: { _id: 1 } },
    { $project: { _id: 0, session: "$_id", exams: "$exams" } },
  ]).read('secondaryPreferred');

  res.status(200).json({
    message: "Student exam history retrieved successfully.",
    data: examHistory,
  });
});
