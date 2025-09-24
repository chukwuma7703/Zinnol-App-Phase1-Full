import { jest, describe, it, expect } from "@jest/globals";
import {
    AppError,
    ValidationError,
    AuthenticationError,
    AuthorizationError,
    ForbiddenError,
    NotFoundError,
    ConflictError,
    DatabaseError,
    ExternalServiceError
} from "./AppError.js";

describe("AppError Classes", () => {
    describe("AppError", () => {
        it("should create an AppError with default status code 500", () => {
            const error = new AppError("Test error");
            expect(error.message).toBe("Test error");
            expect(error.statusCode).toBe(500);
            expect(error.status).toBe("error");
            expect(error.isOperational).toBe(true);
            expect(error).toBeInstanceOf(Error);
        });

        it("should create an AppError with custom status code", () => {
            const error = new AppError("Test error", 400);
            expect(error.message).toBe("Test error");
            expect(error.statusCode).toBe(400);
            expect(error.status).toBe("fail");
            expect(error.isOperational).toBe(true);
        });

        it("should create an AppError with 4xx status code as 'fail'", () => {
            const error = new AppError("Test error", 404);
            expect(error.status).toBe("fail");
        });

        it("should create an AppError with 5xx status code as 'error'", () => {
            const error = new AppError("Test error", 500);
            expect(error.status).toBe("error");
        });

        it("should capture stack trace", () => {
            const error = new AppError("Test error");
            expect(error.stack).toBeDefined();
            expect(error.stack).toContain("AppError");
        });
    });

    describe("ValidationError", () => {
        it("should create a ValidationError with status 400", () => {
            const error = new ValidationError("Invalid input");
            expect(error.message).toBe("Invalid input");
            expect(error.statusCode).toBe(400);
            expect(error.status).toBe("fail");
            expect(error.type).toBe("VALIDATION_ERROR");
            expect(error.isOperational).toBe(true);
        });

        it("should create a ValidationError with details", () => {
            const details = { field: "email", issue: "invalid format" };
            const error = new ValidationError("Invalid email", details);
            expect(error.details).toEqual(details);
        });

        it("should inherit from AppError", () => {
            const error = new ValidationError("Invalid input");
            expect(error).toBeInstanceOf(AppError);
            expect(error).toBeInstanceOf(Error);
        });
    });

    describe("AuthenticationError", () => {
        it("should create an AuthenticationError with default message", () => {
            const error = new AuthenticationError();
            expect(error.message).toBe("Authentication failed");
            expect(error.statusCode).toBe(401);
            expect(error.status).toBe("fail");
            expect(error.type).toBe("AUTHENTICATION_ERROR");
        });

        it("should create an AuthenticationError with custom message", () => {
            const error = new AuthenticationError("Custom auth error");
            expect(error.message).toBe("Custom auth error");
            expect(error.statusCode).toBe(401);
        });

        it("should inherit from AppError", () => {
            const error = new AuthenticationError();
            expect(error).toBeInstanceOf(AppError);
        });
    });

    describe("AuthorizationError", () => {
        it("should create an AuthorizationError with default message", () => {
            const error = new AuthorizationError();
            expect(error.message).toBe("Insufficient permissions");
            expect(error.statusCode).toBe(403);
            expect(error.status).toBe("fail");
            expect(error.type).toBe("AUTHORIZATION_ERROR");
        });

        it("should create an AuthorizationError with custom message", () => {
            const error = new AuthorizationError("Custom authz error");
            expect(error.message).toBe("Custom authz error");
            expect(error.statusCode).toBe(403);
        });

        it("should inherit from AppError", () => {
            const error = new AuthorizationError();
            expect(error).toBeInstanceOf(AppError);
        });
    });

    describe("ForbiddenError", () => {
        it("should create a ForbiddenError with default message", () => {
            const error = new ForbiddenError();
            expect(error.message).toBe("Access forbidden");
            expect(error.statusCode).toBe(403);
            expect(error.status).toBe("fail");
            expect(error.type).toBe("FORBIDDEN_ERROR");
        });

        it("should create a ForbiddenError with custom message", () => {
            const error = new ForbiddenError("Custom forbidden error");
            expect(error.message).toBe("Custom forbidden error");
            expect(error.statusCode).toBe(403);
        });

        it("should inherit from AuthorizationError and AppError", () => {
            const error = new ForbiddenError();
            expect(error).toBeInstanceOf(AuthorizationError);
            expect(error).toBeInstanceOf(AppError);
        });
    });

    describe("NotFoundError", () => {
        it("should create a NotFoundError with default resource", () => {
            const error = new NotFoundError();
            expect(error.message).toBe("Resource not found");
            expect(error.statusCode).toBe(404);
            expect(error.status).toBe("fail");
            expect(error.type).toBe("NOT_FOUND_ERROR");
        });

        it("should create a NotFoundError with custom resource", () => {
            const error = new NotFoundError("User");
            expect(error.message).toBe("User not found");
            expect(error.statusCode).toBe(404);
        });

        it("should inherit from AppError", () => {
            const error = new NotFoundError();
            expect(error).toBeInstanceOf(AppError);
        });
    });

    describe("ConflictError", () => {
        it("should create a ConflictError with default message", () => {
            const error = new ConflictError();
            expect(error.message).toBe("Resource conflict");
            expect(error.statusCode).toBe(409);
            expect(error.status).toBe("fail");
            expect(error.type).toBe("CONFLICT_ERROR");
        });

        it("should create a ConflictError with custom message", () => {
            const error = new ConflictError("Custom conflict error");
            expect(error.message).toBe("Custom conflict error");
            expect(error.statusCode).toBe(409);
        });

        it("should inherit from AppError", () => {
            const error = new ConflictError();
            expect(error).toBeInstanceOf(AppError);
        });
    });

    describe("DatabaseError", () => {
        it("should create a DatabaseError with default message", () => {
            const error = new DatabaseError();
            expect(error.message).toBe("Database operation failed");
            expect(error.statusCode).toBe(500);
            expect(error.status).toBe("error");
            expect(error.type).toBe("DATABASE_ERROR");
            expect(error.originalError).toBeNull();
        });

        it("should create a DatabaseError with custom message and original error", () => {
            const originalError = new Error("Connection failed");
            const error = new DatabaseError("Custom DB error", originalError);
            expect(error.message).toBe("Custom DB error");
            expect(error.originalError).toBe(originalError);
        });

        it("should inherit from AppError", () => {
            const error = new DatabaseError();
            expect(error).toBeInstanceOf(AppError);
        });
    });

    describe("ExternalServiceError", () => {
        it("should create an ExternalServiceError with service name", () => {
            const error = new ExternalServiceError("Google API");
            expect(error.message).toBe("Google API: External service error");
            expect(error.statusCode).toBe(502);
            expect(error.status).toBe("error");
            expect(error.type).toBe("EXTERNAL_SERVICE_ERROR");
            expect(error.service).toBe("Google API");
        });

        it("should create an ExternalServiceError with custom message", () => {
            const error = new ExternalServiceError("Weather API", "Service unavailable");
            expect(error.message).toBe("Weather API: Service unavailable");
            expect(error.statusCode).toBe(502);
            expect(error.service).toBe("Weather API");
        });

        it("should inherit from AppError", () => {
            const error = new ExternalServiceError("Test Service");
            expect(error).toBeInstanceOf(AppError);
        });
    });
});
