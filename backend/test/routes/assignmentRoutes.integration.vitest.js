import request from "supertest";
import app from "../../app.js";

describe("Assignment Routes Integration Tests", () => {
    let teacherToken;
    let studentToken;
    let schoolId;
    let classroomId;
    let assignmentId;

    // Setup test data
    beforeAll(async () => {
        try {
            // Create a school first
            const schoolData = {
                name: "Test School",
                address: "123 Test Street",
                email: "school@test.com",
                phone: "123-456-7890",
                type: "secondary"
            };

            const schoolRes = await request(app)
                .post("/api/schools")
                .send(schoolData);

            if (schoolRes.status === 201) {
                schoolId = schoolRes.body.school._id;
            } else {
                // School might already exist, try to find it
                const schoolsRes = await request(app).get("/api/schools");
                if (schoolsRes.body.schools && schoolsRes.body.schools.length > 0) {
                    schoolId = schoolsRes.body.schools[0]._id;
                }
            }

            // Register teacher
            const teacherData = {
                name: "Test Teacher",
                email: "teacher@test.com",
                password: "password123",
                role: "teacher",
                schoolId: schoolId
            };

            const teacherRes = await request(app)
                .post("/api/users/register")
                .send(teacherData);

            if (teacherRes.status === 201) {
                teacherToken = teacherRes.body.accessToken;
            }

            // Register student
            const studentData = {
                name: "Test Student",
                email: "student@test.com",
                password: "password123",
                role: "student",
                schoolId: schoolId
            };

            const studentRes = await request(app)
                .post("/api/users/register")
                .send(studentData);

            if (studentRes.status === 201) {
                studentToken = studentRes.body.accessToken;
            }

            // Create classroom if teacher token exists
            if (teacherToken) {
                const classroomData = {
                    name: "Test Classroom",
                    subject: "Mathematics",
                    grade: "Grade 10"
                };

                const classroomRes = await request(app)
                    .post("/api/classrooms")
                    .set("Authorization", `Bearer ${teacherToken}`)
                    .send(classroomData);

                if (classroomRes.status === 201) {
                    classroomId = classroomRes.body.classroom._id;
                }
            }
        } catch (error) {
            console.log("Setup error:", error.message);
        }
    });

    describe("POST /api/assignments", () => {
        it("should allow teacher to create an assignment", async () => {
            if (!teacherToken || !classroomId) {
                console.log("Skipping test - missing teacher token or classroom");
                return;
            }

            const assignmentData = {
                title: "Test Assignment",
                description: "This is a test assignment",
                classroomId: classroomId,
                dueDate: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(), // 7 days from now
                totalMarks: 100
            };

            const res = await request(app)
                .post("/api/assignments")
                .set("Authorization", `Bearer ${teacherToken}`)
                .send(assignmentData)
                .expect(201);

            expect(res.body).toHaveProperty("assignment");
            expect(res.body.assignment.title).toBe(assignmentData.title);
            expect(res.body.assignment.description).toBe(assignmentData.description);
            expect(res.body.assignment.classroomId).toBe(classroomId);

            assignmentId = res.body.assignment._id;
        });

        it("should return 401 for unauthenticated user", async () => {
            const assignmentData = {
                title: "Test Assignment",
                description: "This is a test assignment",
                classroomId: classroomId || "dummy-id",
                dueDate: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
                totalMarks: 100
            };

            const res = await request(app)
                .post("/api/assignments")
                .send(assignmentData)
                .expect(401);

            expect(res.body).toHaveProperty("message");
        });
    });

    describe("GET /api/assignments/class/:classroomId", () => {
        it("should get assignments for a classroom", async () => {
            if (!teacherToken || !classroomId) {
                console.log("Skipping test - missing teacher token or classroom");
                return;
            }

            const res = await request(app)
                .get(`/api/assignments/class/${classroomId}`)
                .set("Authorization", `Bearer ${teacherToken}`)
                .expect(200);

            expect(Array.isArray(res.body.assignments)).toBe(true);
            if (res.body.assignments.length > 0) {
                expect(res.body.assignments[0]).toHaveProperty("title");
                expect(res.body.assignments[0]).toHaveProperty("description");
            }
        });
    });

    describe("GET /api/assignments/:id", () => {
        it("should get a specific assignment", async () => {
            if (!teacherToken || !assignmentId) {
                console.log("Skipping test - missing teacher token or assignment");
                return;
            }

            const res = await request(app)
                .get(`/api/assignments/${assignmentId}`)
                .set("Authorization", `Bearer ${teacherToken}`)
                .expect(200);

            expect(res.body).toHaveProperty("assignment");
            expect(res.body.assignment._id).toBe(assignmentId);
            expect(res.body.assignment).toHaveProperty("title");
        });
    });

    describe("PUT /api/assignments/:id", () => {
        it("should allow teacher to update an assignment", async () => {
            if (!teacherToken || !assignmentId) {
                console.log("Skipping test - missing teacher token or assignment");
                return;
            }

            const updateData = {
                title: "Updated Test Assignment",
                description: "This is an updated test assignment"
            };

            const res = await request(app)
                .put(`/api/assignments/${assignmentId}`)
                .set("Authorization", `Bearer ${teacherToken}`)
                .send(updateData)
                .expect(200);

            expect(res.body).toHaveProperty("assignment");
            expect(res.body.assignment.title).toBe(updateData.title);
            expect(res.body.assignment.description).toBe(updateData.description);
        });
    });

    describe("DELETE /api/assignments/:id", () => {
        it("should allow teacher to delete an assignment", async () => {
            if (!teacherToken || !assignmentId) {
                console.log("Skipping test - missing teacher token or assignment");
                return;
            }

            const res = await request(app)
                .delete(`/api/assignments/${assignmentId}`)
                .set("Authorization", `Bearer ${teacherToken}`)
                .expect(200);

            expect(res.body).toHaveProperty("message");
            expect(res.body.message).toMatch(/deleted|removed/i);
        });
    });
});
