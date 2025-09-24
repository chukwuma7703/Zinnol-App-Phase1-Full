import { vi, describe, it, expect, beforeEach } from "vitest";
import fs from "fs";

describe("CSV Utilities", () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    describe("parseCsvFile", () => {
        it("should parse CSV file successfully", async () => {
            const { parseCsvFile } = await import("./csvUtils.js");

            const mockData = [
                { name: "John", age: "25", city: "New York" },
                { name: "Jane", age: "30", city: "London" }
            ];

            const mockStream = {
                pipe: vi.fn().mockReturnThis(),
                on: vi.fn()
            };

            // Mock the event handlers
            mockStream.on.mockImplementation((event, callback) => {
                if (event === "data") {
                    mockData.forEach(row => callback(row));
                } else if (event === "end") {
                    callback();
                }
                return mockStream;
            });

            vi.spyOn(fs, 'createReadStream').mockReturnValue(mockStream);

            const result = await parseCsvFile("test.csv");

            expect(fs.createReadStream).toHaveBeenCalledWith("test.csv");
            expect(result).toEqual(mockData);
        });

        it("should handle CSV parsing errors", async () => {
            const { parseCsvFile } = await import("./csvUtils.js");

            const mockError = new Error("File not found");
            const mockStream = {
                pipe: vi.fn().mockReturnThis(),
                on: vi.fn()
            };

            mockStream.on.mockImplementation((event, callback) => {
                if (event === "error") {
                    callback(mockError);
                }
                return mockStream;
            });

            vi.spyOn(fs, 'createReadStream').mockReturnValue(mockStream);

            await expect(parseCsvFile("nonexistent.csv")).rejects.toThrow("File not found");
        });

        it("should handle empty CSV file", async () => {
            const { parseCsvFile } = await import("./csvUtils.js");

            const mockStream = {
                pipe: vi.fn().mockReturnThis(),
                on: vi.fn()
            };

            mockStream.on.mockImplementation((event, callback) => {
                if (event === "end") {
                    callback();
                }
                return mockStream;
            });

            vi.spyOn(fs, 'createReadStream').mockReturnValue(mockStream);

            const result = await parseCsvFile("empty.csv");

            expect(result).toEqual([]);
        });
    });

    describe("convertToCsv", () => {
        it("should convert array of objects to CSV string", async () => {
            const { convertToCsv } = await import("./csvUtils.js");

            const data = [
                { name: "John", age: 25, city: "New York" },
                { name: "Jane", age: 30, city: "London" }
            ];

            const fields = ["name", "age", "city"];
            const result = convertToCsv(data, fields);

            expect(typeof result).toBe("string");
            expect(result).toContain('"name","age","city"');
            expect(result).toContain('"John",25,"New York"');
            expect(result).toContain('"Jane",30,"London"');
        });

        it("should handle empty array", async () => {
            const { convertToCsv } = await import("./csvUtils.js");

            const data = [];
            const fields = ["name", "age"];
            const result = convertToCsv(data, fields);

            expect(result).toContain('"name","age"');
        });

        it("should handle objects with missing fields", async () => {
            const { convertToCsv } = await import("./csvUtils.js");

            const data = [
                { name: "John", age: 25 },
                { name: "Jane", city: "London" }
            ];

            const fields = ["name", "age", "city"];
            const result = convertToCsv(data, fields);

            expect(result).toContain('"John",25,');
            expect(result).toContain('"Jane",,"London"');
        });

        it("should handle special characters and escaping", async () => {
            const { convertToCsv } = await import("./csvUtils.js");

            const data = [
                { name: "John, Jr.", description: 'He said "Hello"' }
            ];

            const fields = ["name", "description"];
            const result = convertToCsv(data, fields);

            expect(result).toContain('"John, Jr."');
            expect(result).toContain('"He said ""Hello"""');
        });

        it("should handle different data types", async () => {
            const { convertToCsv } = await import("./csvUtils.js");

            const data = [
                { name: "John", age: 25, active: true, score: 95.5 }
            ];

            const fields = ["name", "age", "active", "score"];
            const result = convertToCsv(data, fields);

            expect(result).toContain('"John",25,true,95.5');
        });
    });
});
