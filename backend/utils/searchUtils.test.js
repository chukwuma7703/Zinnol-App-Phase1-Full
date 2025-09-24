import { jest, describe, it, expect, beforeEach } from "@jest/globals";
import fs from "fs";
import path from "path";
import { searchCodebase } from "./searchUtils.js";

describe("Search Utilities", () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    describe("searchCodebase", () => {
        it("should search for query in codebase files", async () => {
            // Mock process.cwd()
            const mockCwd = "/mock/project";
            process.cwd = jest.fn().mockReturnValue(mockCwd);

            // Mock path.resolve
            path.resolve = jest.fn().mockReturnValue("/mock/project");

            // Mock directory structure
            const mockFiles = {
                "/mock/project/file1.js": "console.log('hello world');",
                "/mock/project/file2.md": "# Hello World Documentation",
                "/mock/project/file3.json": '{"message": "hello world"}',
                "/mock/project/file4.txt": "This file should be ignored"
            };

            // Mock fs.readdirSync to return directory structure
            fs.readdirSync.mockImplementation((dir) => {
                if (dir === "/mock/project") {
                    return ["file1.js", "file2.md", "file3.json", "file4.txt", "subdir"];
                }
                if (dir === path.join("/mock/project", "subdir")) {
                    return ["file5.js"];
                }
                return [];
            });

            // Mock fs.statSync
            fs.statSync.mockImplementation((filePath) => ({
                isDirectory: () => filePath && filePath.includes("subdir")
            }));            // Mock fs.readFileSync
            fs.readFileSync.mockImplementation((filePath) => mockFiles[filePath] || "");

            const results = await searchCodebase("hello world");

            expect(results.length).toBeGreaterThan(0);
            expect(results.some(result => result.file.includes("file1.js"))).toBe(true);
            expect(results.some(result => result.file.includes("file2.md"))).toBe(true);
            expect(results.some(result => result.file.includes("file3.json"))).toBe(true);
        });

        it("should handle case insensitive search", async () => {
            const mockCwd = "/mock/project";
            process.cwd = jest.fn().mockReturnValue(mockCwd);
            path.resolve = jest.fn().mockReturnValue("/mock/project");

            fs.readdirSync.mockImplementation((dir) => {
                if (dir === "/mock/project") {
                    return ["test.js"];
                }
                return [];
            });

            fs.statSync.mockImplementation(() => ({
                isDirectory: () => false
            }));

            fs.readFileSync.mockReturnValue("Console.log('HELLO WORLD');");

            const results = await searchCodebase("hello world");

            expect(results.length).toBe(1);
            expect(results[0].file).toContain("test.js");
        });

        it("should extract snippets around the query", async () => {
            const mockCwd = "/mock/project";
            process.cwd = jest.fn().mockReturnValue(mockCwd);
            path.resolve = jest.fn().mockReturnValue("/mock/project");

            fs.readdirSync.mockImplementation((dir) => {
                if (dir === "/mock/project") {
                    return ["test.js"];
                }
                return [];
            });

            fs.statSync.mockImplementation(() => ({
                isDirectory: () => false
            }));

            const longContent = "This is a very long piece of code that contains the word 'search' somewhere in the middle of this text.";
            fs.readFileSync.mockReturnValue(longContent);

            const results = await searchCodebase("search");

            expect(results.length).toBe(1);
            expect(results[0].snippet).toContain("search");
            expect(results[0].snippet.length).toBeLessThanOrEqual(80 + "search".length); // 40 chars before + query + 40 chars after
        });

        it("should only search files with specified extensions", async () => {
            const mockCwd = "/mock/project";
            process.cwd = jest.fn().mockReturnValue(mockCwd);
            path.resolve = jest.fn().mockReturnValue("/mock/project");

            fs.readdirSync.mockImplementation((dir) => {
                if (dir === "/mock/project") {
                    return ["file.js", "file.jsx", "file.md", "file.json", "file.txt", "file.py"];
                }
                return [];
            });

            fs.statSync.mockImplementation(() => ({
                isDirectory: () => false
            }));

            fs.readFileSync.mockReturnValue("content with query");

            const results = await searchCodebase("query");

            // Should only include .js, .jsx, .md, .json files
            expect(results.length).toBe(4);
            expect(results.every(result =>
                result.file.endsWith(".js") ||
                result.file.endsWith(".jsx") ||
                result.file.endsWith(".md") ||
                result.file.endsWith(".json")
            )).toBe(true);
        });

        it("should handle empty query", async () => {
            const mockCwd = "/mock/project";
            process.cwd = jest.fn().mockReturnValue(mockCwd);
            path.resolve = jest.fn().mockReturnValue("/mock/project");

            fs.readdirSync.mockImplementation(() => []);
            fs.statSync.mockImplementation(() => ({ isDirectory: () => false }));
            fs.readFileSync.mockReturnValue("");

            const results = await searchCodebase("");

            expect(results).toEqual([]);
        });

        it("should handle file system errors gracefully", async () => {
            const mockCwd = "/mock/project";
            process.cwd = jest.fn().mockReturnValue(mockCwd);
            path.resolve = jest.fn().mockReturnValue("/mock/project");

            fs.readdirSync.mockImplementation(() => {
                throw new Error("Permission denied");
            });

            // Should not throw, should return empty results
            const results = await searchCodebase("test");
            expect(results).toEqual([]);
        });

        it("should recursively search subdirectories", async () => {
            const mockCwd = "/mock/project";
            process.cwd = jest.fn().mockReturnValue(mockCwd);
            path.resolve = jest.fn().mockReturnValue("/mock/project");

            fs.readdirSync.mockImplementation((dir) => {
                if (dir === "/mock/project") {
                    return ["subdir"];
                }
                if (dir === path.join("/mock/project", "subdir")) {
                    return ["nested.js"];
                }
                return [];
            });

            fs.statSync.mockImplementation((filePath) => ({
                isDirectory: () => filePath.includes("subdir")
            }));

            fs.readFileSync.mockReturnValue("content with search term");

            const results = await searchCodebase("search");

            expect(results.length).toBe(1);
            expect(results[0].file).toContain("nested.js");
        });
    });
});
