import express from "express";
import supertest from "supertest";
import { jest, describe, it, expect, beforeEach } from "@jest/globals";
import jwt from "jsonwebtoken";




// Mock models before importing the router
jest.unstable_mockModule("../models/School.js", () => ({
    __esModule: true,
    default: {
        findById: jest.fn(),
        create: jest.fn(),
        find: jest.fn(),
        findByIdAndUpdate: jest.fn(),
        findByIdAndDelete: jest.fn(),
        deleteMany: jest.fn(), // Mock for the delete test
    },
}));
jest.unstable_mockModule("../models/userModel.js", () => ({
    __esModule: true,
    default: {
        findById: jest.fn(),
        findByIdAndUpdate: jest.fn(),
        deleteMany: jest.fn(), // Mock for the delete test
    },
}));

// Mock auth middleware used inside the router to bypass DB lookups and attach req.user from JWT
jest.unstable_mockModule("../middleware/authMiddleware.js", () => ({
    __esModule: true,
    protect: jest.fn((req, res, next) => {
        if (req.headers && req.headers.authorization) {
            const token = req.headers.authorization.split(" ")[1];
            try {
                const decoded = jwt.verify(token, process.env.JWT_SECRET);
                // Our tests sign as { user } in payload
                req.user = decoded.user || decoded;
            } catch (e) {
                // ignore, let authorize handle
            }
        }
        next();
    }),
    authorizeRoles: jest.fn((allowed = []) => (req, res, next) => {
        if (!req.user || (allowed.length && !allowed.includes(req.user.role))) {
            return res.status(403).json({ message: "Forbidden: Access denied." });
        }
        next();
    })
}));

// Mock validation to be a no-op so tests don't fail on strict Joi schemas
jest.unstable_mockModule("../middleware/validationMiddleware.js", () => ({
    __esModule: true,
    validate: () => (req, res, next) => next(),
    commonSchemas: {
        objectId: { required: () => ({}), optional: () => ({}) },
        name: { required: () => ({}), optional: () => ({}) },
        email: { required: () => ({}), optional: () => ({}) },
        phone: { required: () => ({}), optional: () => ({}) },
        address: { required: () => ({}), optional: () => ({}) },
        class: { optional: () => ({}) },
        section: { optional: () => ({}) }
    }
}));

// Mock the feature flag middleware to prevent test failures
jest.unstable_mockModule("../middleware/featureFlagMiddleware.js", () => ({
    checkFeatureFlag: jest.fn(() => (req, res, next) => next()),
}));


// Dynamically import modules after mocks are defined
const { default: schoolRoutes } = await import("./schoolRoutes.js");
const { default: School } = await import("../models/School.js");
const { default: User } = await import("../models/userModel.js");
const { roles } = await import("../config/roles.js");
const { default: errorHandler } = await import("../middleware/errorMiddleware.js");

// Setup mock express app
const app = express();
app.use(express.json());

const mockProtect = (req, res, next) => {
    // This simple middleware simulates the `protect` functionality for our tests.
    // It decodes the token and attaches the user to the request.
    if (req.headers.authorization) {
        const token = req.headers.authorization.split(" ")[1];
        try {
            const decoded = jwt.verify(token, process.env.JWT_SECRET);
            req.user = decoded.user; // Matches the structure of generateTokenFor
        } catch (e) {
            // Silently fail on invalid token for tests, let authorizeRoles handle it.
        }
    }
    next();
};
// Apply the mock `protect` middleware before the school routes, just like in app.js
app.use("/api/schools", mockProtect, schoolRoutes);
app.use(errorHandler);

const request = supertest(app);

// --- Mock Data ---
const schoolId = "60d0fe4f5311236168a109cb";
const mainAdminId = "60d0fe4f5311236168a109cc";

const globalAdmin = { _id: "60d0fe4f5311236168a109ca", role: roles.GLOBAL_SUPER_ADMIN, school: null };
const mainAdminOwner = { _id: mainAdminId, role: roles.MAIN_SUPER_ADMIN, school: schoolId };
const mainAdminNonOwner = { _id: "60d0fe4f5311236168a109cd", role: roles.MAIN_SUPER_ADMIN, school: "some_other_school_id" };
const otherSchoolAdmin = { _id: "60d0fe4f5311236168a109cf", role: roles.SUPER_ADMIN, school: "some_other_school_id" };
const superAdminOwner = { _id: "super_admin_id", role: roles.SUPER_ADMIN, school: schoolId };
const teacherToPromote = { _id: "60d0fe4f5311236168a109d0", role: roles.TEACHER, school: schoolId, save: jest.fn().mockResolvedValue(true) };

process.env.JWT_SECRET = "test-secret";

const generateTokenFor = (user) => jwt.sign({ user }, process.env.JWT_SECRET);

describe("School Routes", () => {
    let mockSchool;

    beforeEach(() => {
        jest.clearAllMocks();
        // Reset mockSchool to a clean state before each test to prevent state leakage
        mockSchool = {
            _id: schoolId,
            name: "Test School",
            mainSuperAdmins: [mainAdminId],
            save: jest.fn().mockResolvedValue(true),
        };
        // Default successful school lookup
        School.findById.mockResolvedValue(mockSchool);
        User.findById.mockResolvedValue(teacherToPromote);
    });
    describe("POST /", () => {
        const createSchoolData = { name: "New Academy", address: "123 Education Lane" };

        it("should allow a GLOBAL_SUPER_ADMIN to create a new school", async () => {
            // Mock the School.create method
            const createdSchool = { ...createSchoolData, _id: "new_school_id", createdBy: globalAdmin._id };
            School.create.mockResolvedValue(createdSchool);

            const token = generateTokenFor(globalAdmin);
            const res = await request
                .post("/api/schools")
                .set("Authorization", `Bearer ${token}`)
                .send(createSchoolData);

            expect(res.status).toBe(201);
            expect(res.body.message).toBe("School created successfully");
            expect(res.body.school).toBeDefined();
            expect(res.body.school.name).toBe(createSchoolData.name);
            expect(School.create).toHaveBeenCalledWith({
                ...createSchoolData,
                createdBy: globalAdmin._id,
                mainSuperAdmins: [],
            });
        });

        it("should deny access to a non-GLOBAL_SUPER_ADMIN", async () => {
            const token = generateTokenFor(mainAdminOwner); // Use any non-global admin
            const res = await request.post("/api/schools").set("Authorization", `Bearer ${token}`).send(createSchoolData);

            expect(res.status).toBe(403);
            expect(res.body.message).toContain("Forbidden: Access denied.");
            expect(School.create).not.toHaveBeenCalled();
        });
    });

    describe("GET /", () => {
        it("should allow a GLOBAL_SUPER_ADMIN to get all schools", async () => {
            School.find.mockReturnValue({ populate: jest.fn().mockResolvedValue([mockSchool]) });
            const token = generateTokenFor(globalAdmin);
            const res = await request.get("/api/schools").set("Authorization", `Bearer ${token}`);

            expect(res.status).toBe(200);
            // Response shape is { schools: [...] }
            expect(Array.isArray(res.body.schools)).toBe(true);
            expect(res.body.schools[0].name).toBe("Test School");
            expect(School.find).toHaveBeenCalledWith({});
        });

        it("should deny access to a non-GLOBAL_SUPER_ADMIN", async () => {
            const token = generateTokenFor(mainAdminOwner);
            const res = await request.get("/api/schools").set("Authorization", `Bearer ${token}`);

            expect(res.status).toBe(403);
        });
    });

    describe("GET /:id", () => {
        it("should allow an authorized admin to get school details", async () => {
            const token = generateTokenFor(mainAdminOwner);
            const res = await request.get(`/api/schools/${schoolId}`).set("Authorization", `Bearer ${token}`);

            expect(res.status).toBe(200);
            expect(res.body.name).toBe("Test School");
            expect(School.findById).toHaveBeenCalledWith(schoolId);
        });
    });

    describe("PUT /:id", () => {
        it("should allow a MAIN_SUPER_ADMIN to update their school", async () => {
            const updateData = { name: "Updated Test School" };
            // The controller uses findById, then modifies and saves the document.
            // We need to mock the save method on the object returned by findById.
            mockSchool.save.mockResolvedValue({ ...mockSchool, ...updateData });
            const token = generateTokenFor(mainAdminOwner);
            const res = await request.put(`/api/schools/${schoolId}`).set("Authorization", `Bearer ${token}`).send(updateData);

            expect(res.status).toBe(200);
            expect(res.body.name).toBe("Updated Test School");
            expect(mockSchool.save).toHaveBeenCalled();
        });
    });

    describe("DELETE /:id", () => {
        it("should allow a GLOBAL_SUPER_ADMIN to delete a school", async () => {
            School.findByIdAndDelete.mockResolvedValue(mockSchool);
            User.deleteMany.mockResolvedValue({ acknowledged: true, deletedCount: 5 }); // Mock the user deletion
            const token = generateTokenFor(globalAdmin);
            const res = await request.delete(`/api/schools/${schoolId}`).set("Authorization", `Bearer ${token}`);

            expect(res.status).toBe(200);
            expect(res.body.message).toBe("School and all associated users removed");
            expect(School.findByIdAndDelete).toHaveBeenCalledWith(schoolId);
        });
    });
    describe("POST /:id/assign-main-super-admin", () => {
        const testRoute = `/api/schools/${schoolId}/assign-main-super-admin`;
        const userToAssign = {
            _id: "user_to_assign_id",
            role: roles.TEACHER,
            school: null,
            save: jest.fn().mockResolvedValue(true),
        };

        beforeEach(() => {
            User.findById.mockResolvedValue(userToAssign);
            userToAssign.save.mockClear();
        });

        it("should allow a GLOBAL_SUPER_ADMIN to assign a Main Super Admin", async () => {
            const token = generateTokenFor(globalAdmin);
            const res = await request
                .post(testRoute)
                .set("Authorization", `Bearer ${token}`)
                .send({ userId: userToAssign._id });

            expect(res.status).toBe(200);
            expect(res.body.message).toBe("Main Super Admin assigned");
            expect(mockSchool.mainSuperAdmins).toContain(userToAssign._id);
            expect(mockSchool.save).toHaveBeenCalledTimes(1);
            expect(userToAssign.role).toBe(roles.MAIN_SUPER_ADMIN);
            expect(userToAssign.school).toBe(schoolId);
            expect(userToAssign.save).toHaveBeenCalledTimes(1);
        });

        it("should not re-add an existing main admin to the school", async () => {
            mockSchool.mainSuperAdmins.push(userToAssign._id);
            const token = generateTokenFor(globalAdmin);
            const res = await request.post(testRoute).set("Authorization", `Bearer ${token}`).send({ userId: userToAssign._id });

            // The main correction: The school document is not saved
            expect(mockSchool.save).not.toHaveBeenCalled();
            // The second correction: The user document's role is not changed, so it is not saved
            expect(userToAssign.save).not.toHaveBeenCalled();

            expect(res.status).toBe(200);
            expect(res.body.message).toBe("User is already a Main Super Admin for this school.");
        });

        it("should deny access to a non-GLOBAL_SUPER_ADMIN", async () => {
            const token = generateTokenFor(mainAdminOwner);
            const res = await request.post(testRoute).set("Authorization", `Bearer ${token}`).send({ userId: userToAssign._id });

            expect(res.status).toBe(403);
            expect(res.body.message).toContain("Forbidden: Access denied.");
        });

        it("should return 404 if the user to assign is not found", async () => {
            User.findById.mockResolvedValue(null);
            const token = generateTokenFor(globalAdmin);
            const res = await request.post(testRoute).set("Authorization", `Bearer ${token}`).send({ userId: "non_existent_user" });

            expect(res.status).toBe(404);
            expect(res.body.message).toBe("User not found");
        });

        it("should return 400 if trying to assign a Global Super Admin", async () => {
            User.findById.mockResolvedValue(globalAdmin);
            const token = generateTokenFor(globalAdmin);
            const res = await request.post(testRoute).set("Authorization", `Bearer ${token}`).send({ userId: globalAdmin._id });

            expect(res.status).toBe(400);
            expect(res.body.message).toBe("Cannot assign a Global Super Admin as a Main Super Admin");
        });
    });

    describe("checkSchoolAccess middleware", () => {
        const testRoute = `/api/schools/${schoolId}/assign-super-admin`;

        it("should grant access to a GLOBAL_SUPER_ADMIN for any school", async () => {
            User.findById.mockResolvedValueOnce(teacherToPromote); // For the handler

            const token = generateTokenFor(globalAdmin);
            const res = await request
                .post(testRoute)
                .set("Authorization", `Bearer ${token}`)
                .send({ userId: teacherToPromote._id });

            expect(res.status).toBe(200);
            expect(res.body.message).toBe("Super Admin assigned successfully");
        });

        it("should grant access to a MAIN_SUPER_ADMIN for a school they own", async () => {
            User.findById.mockResolvedValue(teacherToPromote);

            const token = generateTokenFor(mainAdminOwner);
            const res = await request
                .post(testRoute)
                .set("Authorization", `Bearer ${token}`)
                .send({ userId: teacherToPromote._id });

            expect(res.status).toBe(200);
        });

        it("should deny access to a MAIN_SUPER_ADMIN for a school they do not own", async () => {
            const token = generateTokenFor(mainAdminNonOwner);
            const res = await request
                .post(testRoute)
                .set("Authorization", `Bearer ${token}`)
                .send({ userId: teacherToPromote._id });

            expect(res.status).toBe(403);
            expect(res.body.message).toBe("Forbidden: You are not an owner of this school.");
        });

        it("should deny access to a SUPER_ADMIN for a different school", async () => {
            const token = generateTokenFor(otherSchoolAdmin);
            const res = await request
                .post(`/api/schools/${schoolId}/assign-principal`) // Use a route they are allowed to access by role
                .set("Authorization", `Bearer ${token}`)
                .send({ userId: teacherToPromote._id });

            expect(res.status).toBe(403);
            expect(res.body.message).toBe("Forbidden: You can only manage your own school.");
        });

        it("should return 404 if the school does not exist", async () => {
            School.findById.mockResolvedValue(null);

            const token = generateTokenFor(globalAdmin);
            const res = await request
                .post(testRoute)
                .set("Authorization", `Bearer ${token}`)
                .send({ userId: teacherToPromote._id });

            expect(res.status).toBe(404);
            expect(res.body.message).toBe("School not found");
        });
    });

    describe("POST /:id/assign-super-admin", () => {
        const testRoute = `/api/schools/${schoolId}/assign-super-admin`;

        it("should successfully assign a user as a SUPER_ADMIN", async () => {
            User.findById.mockResolvedValue(teacherToPromote);

            const token = generateTokenFor(mainAdminOwner);
            const res = await request
                .post(testRoute)
                .set("Authorization", `Bearer ${token}`)
                .send({ userId: teacherToPromote._id });

            expect(res.status).toBe(200);
            expect(teacherToPromote.save).toHaveBeenCalled();
            expect(teacherToPromote.role).toBe(roles.SUPER_ADMIN);
            expect(teacherToPromote.school).toBe(schoolId);
            // Corrected message for consistency
            expect(res.body.message).toBe("Super Admin assigned successfully");
        });

        it("should return 404 if the user to be assigned does not exist", async () => {
            User.findById.mockResolvedValue(null);

            const token = generateTokenFor(mainAdminOwner);
            const res = await request
                .post(testRoute)
                .set("Authorization", `Bearer ${token}`)
                .send({ userId: "non_existent_user_id" });

            expect(res.status).toBe(404);
            expect(res.body.message).toBe("User not found");
        });

        it("should return 400 if trying to assign a GLOBAL_SUPER_ADMIN", async () => {
            User.findById.mockResolvedValue(globalAdmin);

            const token = generateTokenFor(mainAdminOwner);
            const res = await request
                .post(testRoute)
                .set("Authorization", `Bearer ${token}`)
                .send({ userId: globalAdmin._id });

            expect(res.status).toBe(400);
            expect(res.body.message).toBe(`Cannot change the role of a user with a higher-level role (${globalAdmin.role}).`);
        });
    });
    describe("POST /:id/assign-principal", () => {
        const testRoute = `/api/schools/${schoolId}/assign-principal`;
        const userToAssign = { _id: "user_to_assign_id", role: roles.TEACHER, school: null, save: jest.fn().mockResolvedValue(true) };

        it("should allow a SUPER_ADMIN to assign a Principal", async () => {
            User.findById.mockResolvedValue(userToAssign);
            const token = generateTokenFor(superAdminOwner);
            const res = await request.post(testRoute).set("Authorization", `Bearer ${token}`).send({ userId: userToAssign._id });

            expect(res.status).toBe(200);
            expect(res.body.message).toBe("Principal assigned successfully");
            expect(userToAssign.role).toBe(roles.PRINCIPAL);
            expect(userToAssign.school).toBe(schoolId);
            expect(userToAssign.save).toHaveBeenCalled();
        });
    });

    describe("DELETE /:id/remove-main-super-admin", () => {
        const testRoute = `/api/schools/${schoolId}/remove-main-super-admin`;
        const userToRemoveId = "user_to_remove_id";

        it("should deny if the last main admin tries to remove themselves", async () => {
            // The user being removed is the last admin, and is also the actor.

            const schoolWithOneAdmin = {
                ...mockSchool,
                mainSuperAdmins: [globalAdmin._id],
            };
            School.findById.mockResolvedValue(schoolWithOneAdmin);

            const token = generateTokenFor(globalAdmin);
            const res = await request
                .delete(testRoute)
                .set("Authorization", `Bearer ${token}`)
                .send({ userId: globalAdmin._id });

            expect(res.status).toBe(400);
            expect(res.body.message).toBe("You cannot remove yourself if you are the last Main Super Admin");
        });

        it("should deny if the last main admin is removed by another user", async () => {
            const schoolWithOneAdmin = {
                ...mockSchool,
                mainSuperAdmins: [userToRemoveId],
            };
            School.findById.mockResolvedValue(schoolWithOneAdmin);

            // The user performing the action must be a GLOBAL_SUPER_ADMIN to pass authorization
            const token = generateTokenFor(globalAdmin);

            const res = await request
                .delete(testRoute)
                .set("Authorization", `Bearer ${token}`)
                .send({ userId: userToRemoveId });

            expect(res.status).toBe(400);
            expect(res.body.message).toBe("You cannot remove the last Main Super Admin");
        });

        it("should successfully remove a main super admin and demote them", async () => {
            const mainAdminsArray = [globalAdmin._id, userToRemoveId];
            mainAdminsArray.pull = jest.fn(); // Mock the Mongoose 'pull' method on the array
            const schoolWithTwoAdmins = {
                ...mockSchool,
                mainSuperAdmins: mainAdminsArray,
                save: jest.fn().mockResolvedValue(true),
            };
            School.findById.mockResolvedValue(schoolWithTwoAdmins);
            User.findByIdAndUpdate.mockResolvedValue(true); // Mock the user demotion

            const token = generateTokenFor(globalAdmin);
            const res = await request
                .delete(testRoute)
                .set("Authorization", `Bearer ${token}`)
                .send({ userId: userToRemoveId });

            expect(res.status).toBe(200);
            expect(res.body.message).toBe("Main Super Admin removed");
            expect(schoolWithTwoAdmins.save).toHaveBeenCalled();
            expect(User.findByIdAndUpdate).toHaveBeenCalledWith(userToRemoveId, { $set: { role: roles.TEACHER, school: null } });
        });
    });
});
