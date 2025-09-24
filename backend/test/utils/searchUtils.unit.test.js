import { vi, describe, it, expect, beforeEach } from "vitest";
import fs from "fs";
import path from "path";

describe("Search Utils", () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    describe("searchCodebase", () => {
        it("should find query in matching files", async () => {
            const { searchCodebase } = await import("../../utils/searchUtils.js");

            const mockQuery = "testQuery";
            const mockRootDir = "/mock/root";
            const mockFiles = [
                { path: "/mock/root/file1.js", content: "This contains testQuery in javascript" },
                { path: "/mock/root/file2.md", content: "This is a markdown file with testQuery" },
                { path: "/mock/root/file3.json", content: "This JSON has testQuery too" },
                { path: "/mock/root/file4.txt", content: "This text file does not have the query" }
            ];

            vi.spyOn(path, "resolve").mockReturnValue(mockRootDir);
            vi.spyOn(fs, "readdirSync").mockImplementation((dir) => {
                if (dir === mockRootDir) {
                    return ["file1.js", "file2.md", "file3.json", "file4.txt"];
                }
                return [];
            });
            vi.spyOn(fs, "statSync").mockReturnValue({ isDirectory: () => false });
            vi.spyOn(fs, "readFileSync").mockImplementation((filePath) => {
                const file = mockFiles.find((f) => f.path === filePath);
                return file ? file.content : "";
            });

            const result = await searchCodebase(mockQuery);

            expect(result).toHaveLength(3);
            expect(result.map(r => r.file)).toEqual([
                "/mock/root/file1.js",
                "/mock/root/file2.md",
                "/mock/root/file3.json",
            ]);
            expect(result[0].snippet).toContain("testQuery");
        });

        it("should handle case insensitive search", async () => {
            const { searchCodebase } = await import("../../utils/searchUtils.js");
            const mockQuery = "TestQuery";
            const mockRootDir = "/mock/root";
            vi.spyOn(path, "resolve").mockReturnValue(mockRootDir);
            vi.spyOn(fs, "readdirSync").mockReturnValue(["file.js"]);
            vi.spyOn(fs, "statSync").mockReturnValue({ isDirectory: () => false });
            vi.spyOn(fs, "readFileSync").mockReturnValue("This contains testquery in lowercase");
            const result = await searchCodebase(mockQuery);
            expect(result).toHaveLength(1);
            expect(result[0].file).toBe("/mock/root/file.js");
        });

        it("should only search supported extensions", async () => {
            const { searchCodebase } = await import("../../utils/searchUtils.js");
            const mockQuery = "test";
            const mockRootDir = "/mock/root";
            vi.spyOn(path, "resolve").mockReturnValue(mockRootDir);
            vi.spyOn(fs, "readdirSync").mockReturnValue(["file.js", "file.jsx", "file.md", "file.json", "file.txt", "file.py"]);
            vi.spyOn(fs, "statSync").mockReturnValue({ isDirectory: () => false });
            vi.spyOn(fs, "readFileSync").mockReturnValue("content with test");
            const result = await searchCodebase(mockQuery);
            expect(result).toHaveLength(4);
        });
    });
});
