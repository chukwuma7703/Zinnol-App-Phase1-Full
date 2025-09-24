import { jest, describe, it, expect, beforeEach } from "@jest/globals";
import Joi from 'joi';

// Mock ValidationError
jest.unstable_mockModule("../utils/AppError.js", () => ({
    ValidationError: class ValidationError extends Error {
        constructor(message, details) {
            super(message);
            this.name = 'ValidationError';
            this.details = details;
            this.statusCode = 400;
        }
    }
}));

// Import after mocking
const { ValidationError } = await import("../utils/AppError.js");
const { validate, commonSchemas, examSchemas, userSchemas } = await import("../middleware/validationMiddleware.js");

describe("Validation Middleware", () => {
    let req, res, next;

    beforeEach(() => {
        req = {
            body: {},
            query: {},
            params: {}
        };
        res = {};
        next = jest.fn();
        jest.clearAllMocks();
    });

    describe("validate function", () => {
        it("should call next() when validation passes", () => {
            const schema = Joi.object({ email: commonSchemas.email });
            const middleware = validate(schema, 'body');

            req.body = { email: 'test@example.com' };

            middleware(req, res, next);

            expect(next).toHaveBeenCalledWith();
            expect(req.body.email).toBe('test@example.com');
        });

        it("should call next() with ValidationError when validation fails", () => {
            const schema = Joi.object({ email: commonSchemas.email });
            const middleware = validate(schema, 'body');

            req.body = { email: 'invalid-email' };

            middleware(req, res, next);

            expect(next).toHaveBeenCalledWith(expect.any(ValidationError));
            const error = next.mock.calls[0][0];
            expect(error.details).toBeDefined();
            expect(error.details.length).toBeGreaterThan(0);
        });

        it("should validate query parameters", () => {
            const schema = Joi.object({ id: commonSchemas.objectId });
            const middleware = validate(schema, 'query');

            req.query = { id: '507f1f77bcf86cd799439011' };

            middleware(req, res, next);

            expect(next).toHaveBeenCalledWith();
            expect(req.query.id).toBe('507f1f77bcf86cd799439011');
        });

        it("should validate route parameters", () => {
            const schema = Joi.object({ id: commonSchemas.objectId });
            const middleware = validate(schema, 'params');

            req.params = { id: '507f1f77bcf86cd799439011' };

            middleware(req, res, next);

            expect(next).toHaveBeenCalledWith();
            expect(req.params.id).toBe('507f1f77bcf86cd799439011');
        });

        it("should strip unknown properties", () => {
            const schema = Joi.object({ email: commonSchemas.email });
            const middleware = validate(schema, 'body');

            req.body = {
                email: 'test@example.com',
                unknownField: 'should be removed',
                anotherUnknown: 123
            };

            middleware(req, res, next);

            expect(next).toHaveBeenCalledWith();
            expect(req.body.email).toBe('test@example.com');
            expect(req.body.unknownField).toBeUndefined();
            expect(req.body.anotherUnknown).toBeUndefined();
        });

        it("should convert types when possible", () => {
            const schema = Joi.object({ number: commonSchemas.positiveInt });
            const middleware = validate(schema, 'body');

            req.body = { number: '42' };

            middleware(req, res, next);

            expect(next).toHaveBeenCalledWith();
            expect(req.body.number).toBe(42);
        });

        it("should return all validation errors when abortEarly is false", () => {
            const schema = Joi.object({
                email: commonSchemas.email.required(),
                password: commonSchemas.password.required()
            });
            const middleware = validate(schema, 'body');

            req.body = {
                email: 'invalid-email',
                password: 'weak'
            };

            middleware(req, res, next);

            expect(next).toHaveBeenCalledWith(expect.any(ValidationError));
            const error = next.mock.calls[0][0];
            expect(error.details.length).toBeGreaterThan(1);
        });
    });

    describe("commonSchemas", () => {
        describe("objectId", () => {
            it("should validate valid ObjectId", () => {
                const schema = Joi.object({ id: commonSchemas.objectId });
                const middleware = validate(schema, 'body');

                req.body = { id: '507f1f77bcf86cd799439011' };

                middleware(req, res, next);

                expect(next).toHaveBeenCalledWith();
            });

            it("should reject invalid ObjectId", () => {
                const schema = Joi.object({ id: commonSchemas.objectId });
                const middleware = validate(schema, 'body');

                req.body = { id: 'invalid-id' };

                middleware(req, res, next);

                expect(next).toHaveBeenCalledWith(expect.any(ValidationError));
            });
        });

        describe("email", () => {
            it("should validate and lowercase email", () => {
                const schema = Joi.object({ email: commonSchemas.email });
                const middleware = validate(schema, 'body');

                req.body = { email: 'Test@Example.COM' };

                middleware(req, res, next);

                expect(next).toHaveBeenCalledWith();
                expect(req.body.email).toBe('test@example.com');
            });

            it("should reject invalid email", () => {
                const schema = Joi.object({ email: commonSchemas.email });
                const middleware = validate(schema, 'body');

                req.body = { email: 'not-an-email' };

                middleware(req, res, next);

                expect(next).toHaveBeenCalledWith(expect.any(ValidationError));
            });
        });

        describe("password", () => {
            it("should validate strong password", () => {
                const schema = Joi.object({ password: commonSchemas.password });
                const middleware = validate(schema, 'body');

                req.body = { password: 'StrongPass123' };

                middleware(req, res, next);

                expect(next).toHaveBeenCalledWith();
            });

            it("should reject weak password", () => {
                const schema = Joi.object({ password: commonSchemas.password });
                const middleware = validate(schema, 'body');

                req.body = { password: 'weak' };

                middleware(req, res, next);

                expect(next).toHaveBeenCalledWith(expect.any(ValidationError));
            });
        });

        describe("pagination", () => {
            it("should validate pagination with defaults", () => {
                const middleware = validate(commonSchemas.pagination, 'query');

                req.query = {};

                middleware(req, res, next);

                expect(next).toHaveBeenCalledWith();
                expect(req.query.page).toBe(1);
                expect(req.query.limit).toBe(10);
                expect(req.query.sort).toBe('-createdAt');
            });

            it("should validate custom pagination values", () => {
                const middleware = validate(commonSchemas.pagination, 'query');

                req.query = { page: '2', limit: '20', sort: 'createdAt' };

                middleware(req, res, next);

                expect(next).toHaveBeenCalledWith();
                expect(req.query.page).toBe(2);
                expect(req.query.limit).toBe(20);
                expect(req.query.sort).toBe('createdAt');
            });
        });
    });

    describe("examSchemas", () => {
        describe("createExam", () => {
            it("should validate valid exam creation data", () => {
                const middleware = validate(examSchemas.createExam, 'body');

                req.body = {
                    classroom: '507f1f77bcf86cd799439011',
                    title: 'Mathematics Exam',
                    session: '2024/2025',
                    term: 1,
                    subject: '507f1f77bcf86cd799439012'
                };

                middleware(req, res, next);

                expect(next).toHaveBeenCalledWith();
                expect(req.body.durationInMinutes).toBe(60); // default value
                expect(req.body.maxPauses).toBe(3); // default value
            });

            it("should reject invalid exam data", () => {
                const middleware = validate(examSchemas.createExam, 'body');

                req.body = {
                    classroom: 'invalid-id',
                    title: 'A', // too short
                    session: 'invalid-session',
                    term: 4, // invalid term
                    subject: 'invalid-id'
                };

                middleware(req, res, next);

                expect(next).toHaveBeenCalledWith(expect.any(ValidationError));
            });
        });

        describe("addQuestion", () => {
            it("should validate objective question", () => {
                const middleware = validate(examSchemas.addQuestion, 'body');

                req.body = {
                    questionText: 'What is 2 + 2?',
                    questionType: 'objective',
                    marks: 5,
                    options: [
                        { text: '3' },
                        { text: '4' },
                        { text: '5' }
                    ],
                    correctOptionIndex: 1
                };

                middleware(req, res, next);

                expect(next).toHaveBeenCalledWith();
            });

            it("should validate theory question", () => {
                const middleware = validate(examSchemas.addQuestion, 'body');

                req.body = {
                    questionText: 'Explain photosynthesis',
                    questionType: 'theory',
                    marks: 10
                };

                middleware(req, res, next);

                expect(next).toHaveBeenCalledWith();
            });

            it("should reject theory question with options", () => {
                const middleware = validate(examSchemas.addQuestion, 'body');

                req.body = {
                    questionText: 'Explain photosynthesis',
                    questionType: 'theory',
                    marks: 10,
                    options: [{ text: 'Option 1' }] // should not be allowed
                };

                middleware(req, res, next);

                expect(next).toHaveBeenCalledWith(expect.any(ValidationError));
            });
        });
    });

    describe("userSchemas", () => {
        describe("register", () => {
            it("should validate valid registration data", () => {
                const middleware = validate(userSchemas.register, 'body');

                req.body = {
                    name: 'John Doe',
                    email: 'john@example.com',
                    password: 'StrongPass123',
                    role: 'TEACHER'
                };

                middleware(req, res, next);

                expect(next).toHaveBeenCalledWith();
                expect(req.body.email).toBe('john@example.com'); // should be lowercased
            });

            it("should validate registration with schoolId", () => {
                const middleware = validate(userSchemas.register, 'body');

                req.body = {
                    name: 'Jane Doe',
                    email: 'jane@example.com',
                    password: 'AnotherPass456',
                    role: 'PRINCIPAL',
                    schoolId: '507f1f77bcf86cd799439011'
                };

                middleware(req, res, next);

                expect(next).toHaveBeenCalledWith();
            });
        });

        describe("login", () => {
            it("should validate login credentials", () => {
                const middleware = validate(userSchemas.login, 'body');

                req.body = {
                    email: 'user@example.com',
                    password: 'password123'
                };

                middleware(req, res, next);

                expect(next).toHaveBeenCalledWith();
                expect(req.body.email).toBe('user@example.com');
            });
        });
    });
});
