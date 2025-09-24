import mongoose from "mongoose";
import { MongoMemoryServer, MongoMemoryReplSet } from "mongodb-memory-server";
import jwt from "jsonwebtoken";
import bcrypt from "bcryptjs";
import User from "../models/userModel.js";
import School from "../models/School.js";
import Classroom from "../models/Classroom.js";
import Subject from "../models/Subject.js";
import Student from "../models/Student.js";
import { roles } from "../config/roles.js";

/**
 * Test database and authentication helper
 */
export class TestHelper {
    static mongoServer = null;
    static mongoUri = null;
    static replSet = null;

    /**
     * Initialize MongoDB Memory Server with replica set for transactions
     */
    static async setupDatabase() {
        // Prefer simple server to avoid heavy binary setup unless explicitly required
        const wantReplSet = process.env.USE_REPLSET === 'true';

        // Avoid re-initialization
        if (this.mongoUri) {
            return;
        }

        // Helper to connect mongoose with sane timeouts to prevent hangs
        const connectMongoose = async (uri) => {
            await mongoose.connect(uri, {
                serverSelectionTimeoutMS: 10000,
                socketTimeoutMS: 20000,
            });
            process.env.MONGO_URI = uri;
        };

        if (wantReplSet) {
            // Try replica set with an abortable timeout fallback to simple server
            let timeoutId;
            const createRepl = async () => {
                this.replSet = await MongoMemoryReplSet.create({
                    replSet: { count: 1, storageEngine: 'wiredTiger', name: 'rs0' }
                });
                this.mongoUri = this.replSet.getUri();
                await connectMongoose(this.mongoUri);
            };

            const timeoutMs = Number(process.env.REPLSET_INIT_TIMEOUT_MS || 20000);
            let replSetOk = false;
            try {
                await Promise.race([
                    createRepl().then(() => { replSetOk = true; if (timeoutId) clearTimeout(timeoutId); }),
                    new Promise((_, reject) => timeoutId = setTimeout(() => {
                        if (!replSetOk) reject(new Error('replset-timeout'));
                    }, timeoutMs)),
                ]);
            } catch (err) {
                // Fall back to simple server if replica set takes too long or fails
                replSetOk = false;
            }

            if (replSetOk) return;
        }

        // Simple in-memory server (fast, reliable for most tests)
        this.mongoServer = await MongoMemoryServer.create({ instance: { dbName: 'jest' } });
        this.mongoUri = this.mongoServer.getUri();
        await connectMongoose(this.mongoUri);
    }

    /**
     * Initialize MongoDB Memory Server without replica set (for simple tests)
     */
    static async setupSimpleDatabase() {
        if (!this.mongoServer) {
            this.mongoServer = await MongoMemoryServer.create({
                instance: { dbName: 'jest' }
            });
            this.mongoUri = this.mongoServer.getUri();
            await mongoose.connect(this.mongoUri);
            process.env.MONGO_URI = this.mongoUri;
        }
    }

    /**
     * Clean up database
     */
    static async teardownDatabase() {
        if (mongoose.connection.readyState !== 0) {
            await mongoose.disconnect();
        }
        if (this.replSet) {
            await this.replSet.stop();
            this.replSet = null;
        }
        if (this.mongoServer) {
            await this.mongoServer.stop();
            this.mongoServer = null;
        }
        this.mongoUri = null;
    }

    /**
     * Clear all collections
     */
    static async clearDatabase() {
        try {
            // Drop the entire database to ensure clean state
            await mongoose.connection.db.dropDatabase();
        } catch (error) {
            // If drop fails, try clearing collections individually
            const collections = mongoose.connection.collections;
            for (const key in collections) {
                try {
                    await collections[key].deleteMany({});
                } catch (e) {
                    // Ignore errors for individual collections
                }
            }
        }
    }

    /**
     * Create test school
     */
    static async createSchool(name = "Test School") {
        return await School.create({ name });
    }

    /**
     * Create test user with JWT token
     */
    static async createUser(userData) {
        const hashedPassword = await bcrypt.hash(userData.password || "password123", 10);
        const user = await User.create({
            ...userData,
            password: hashedPassword,
        });

        const token = jwt.sign(
            { id: user._id, tokenVersion: user.tokenVersion || 0 },
            process.env.JWT_SECRET || "test-secret",
            { expiresIn: '1h' }
        );

        return { user, token };
    }

    /**
     * Create test classroom
     */
    static async createClassroom(schoolId, teacherId, name = "Test Class", level = 1, stage = "jss") {
        return await Classroom.create({
            name,
            level,
            stage,
            school: schoolId,
            teacher: teacherId,
        });
    }

    /**
     * Create test subject
     */
    static async createSubject(schoolId, name = "Mathematics", code = "MTH") {
        return await Subject.create({
            name,
            code,
            school: schoolId,
        });
    }

    /**
     * Create test student
     */
    static async createStudent(classroomId, schoolId, studentData = {}) {
        return await Student.create({
            classroom: classroomId,
            school: schoolId,
            admissionNumber: studentData.admissionNumber || `ADM${Date.now()}`,
            firstName: studentData.firstName || "Test",
            lastName: studentData.lastName || "Student",
            gender: studentData.gender || "Male",
            dateOfBirth: studentData.dateOfBirth || "2010-01-01",
            ...studentData,
        });
    }

    /**
     * Create complete test environment with school, users, classroom, subject, and students
     */
    static async createTestEnvironment() {
        const timestamp = Date.now();

        // Create school
        const school = await this.createSchool(`Test School ${timestamp}`);

        // Create users
        const globalAdmin = await this.createUser({
            name: "Global Admin",
            email: `global${timestamp}@zinnol.com`,
            role: roles.GLOBAL_SUPER_ADMIN,
        });

        const mainAdmin = await this.createUser({
            name: "Main Admin",
            email: `main${timestamp}@zinnol.com`,
            role: roles.MAIN_SUPER_ADMIN,
            school: school._id,
        });

        const principal = await this.createUser({
            name: "Principal",
            email: `principal${timestamp}@zinnol.com`,
            role: roles.PRINCIPAL,
            school: school._id,
        });

        const teacher = await this.createUser({
            name: "Teacher",
            email: `teacher${timestamp}@zinnol.com`,
            role: roles.TEACHER,
            school: school._id,
        });

        const studentUser = await this.createUser({
            name: "Student User",
            email: `student${timestamp}@zinnol.com`,
            role: roles.STUDENT,
            school: school._id,
        });

        // Create classroom and subject
        const classroom = await this.createClassroom(school._id, teacher.user._id);
        const subject = await this.createSubject(school._id);

        // Create student
        const student = await this.createStudent(classroom._id, school._id, {
            firstName: "John",
            lastName: "Doe",
        });

        return {
            school,
            users: {
                globalAdmin,
                mainAdmin,
                principal,
                teacher,
                student: studentUser,
            },
            classroom,
            subject,
            student,
        };
    }
}
