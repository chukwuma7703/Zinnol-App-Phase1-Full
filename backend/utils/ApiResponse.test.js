import { jest, describe, it, expect } from "@jest/globals";
import { ApiResponse } from "./ApiResponse.js";

describe("ApiResponse", () => {
    describe("constructor", () => {
        it("should create an ApiResponse with success status for 2xx codes", () => {
            const response = new ApiResponse(200, { user: "test" }, "User retrieved");
            expect(response.statusCode).toBe(200);
            expect(response.data).toEqual({ user: "test" });
            expect(response.message).toBe("User retrieved");
            expect(response.success).toBe(true);
        });

        it("should create an ApiResponse with success status for 3xx codes", () => {
            const response = new ApiResponse(302, null, "Redirecting");
            expect(response.statusCode).toBe(302);
            expect(response.data).toBeNull();
            expect(response.message).toBe("Redirecting");
            expect(response.success).toBe(true);
        });

        it("should create an ApiResponse with failure status for 4xx codes", () => {
            const response = new ApiResponse(404, null, "Not found");
            expect(response.statusCode).toBe(404);
            expect(response.data).toBeNull();
            expect(response.message).toBe("Not found");
            expect(response.success).toBe(false);
        });

        it("should create an ApiResponse with failure status for 5xx codes", () => {
            const response = new ApiResponse(500, null, "Server error");
            expect(response.statusCode).toBe(500);
            expect(response.data).toBeNull();
            expect(response.message).toBe("Server error");
            expect(response.success).toBe(false);
        });

        it("should use default message when not provided", () => {
            const response = new ApiResponse(201, { id: 1 });
            expect(response.statusCode).toBe(201);
            expect(response.data).toEqual({ id: 1 });
            expect(response.message).toBe("Success");
            expect(response.success).toBe(true);
        });

        it("should handle various data types", () => {
            // String data
            const stringResponse = new ApiResponse(200, "test string");
            expect(stringResponse.data).toBe("test string");

            // Number data
            const numberResponse = new ApiResponse(200, 42);
            expect(numberResponse.data).toBe(42);

            // Boolean data
            const booleanResponse = new ApiResponse(200, true);
            expect(booleanResponse.data).toBe(true);

            // Array data
            const arrayResponse = new ApiResponse(200, [1, 2, 3]);
            expect(arrayResponse.data).toEqual([1, 2, 3]);

            // Null data
            const nullResponse = new ApiResponse(200, null);
            expect(nullResponse.data).toBeNull();

            // Undefined data
            const undefinedResponse = new ApiResponse(200, undefined);
            expect(undefinedResponse.data).toBeUndefined();
        });

        it("should handle edge case status codes", () => {
            // Status code 0
            const zeroResponse = new ApiResponse(0, null);
            expect(zeroResponse.success).toBe(true);

            // Very high status code
            const highResponse = new ApiResponse(999, null);
            expect(highResponse.success).toBe(false);
        });
    });

    describe("success property logic", () => {
        it("should set success to true for status codes less than 400", () => {
            const successCodes = [200, 201, 202, 204, 301, 302, 304, 399];

            successCodes.forEach(code => {
                const response = new ApiResponse(code, null);
                expect(response.success).toBe(true);
            });
        });

        it("should set success to false for status codes 400 and above", () => {
            const failureCodes = [400, 401, 403, 404, 422, 500, 502, 503];

            failureCodes.forEach(code => {
                const response = new ApiResponse(code, null);
                expect(response.success).toBe(false);
            });
        });
    });
});
