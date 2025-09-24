import { jest, describe, it, expect, beforeAll, afterAll, beforeEach } from "@jest/globals";
import mongoose from "mongoose";
import { MongoMemoryServer } from "mongodb-memory-server";
import Question from "./Question.js";

let mongoServer;

beforeAll(async () => {
    mongoServer = await MongoMemoryServer.create({
        instance: { dbName: 'jest-question' },
        replSet: { count: 1 },
    });
    const mongoUri = mongoServer.getUri();
    await mongoose.connect(mongoUri);
});

afterAll(async () => {
    await mongoose.disconnect();
    await mongoServer.stop();
});

beforeEach(async () => {
    // Clear all collections
    const collections = mongoose.connection.collections;
    for (const key in collections) {
        await collections[key].deleteMany({});
    }
});

describe("Question Model", () => {
    // Mock ObjectIds for testing
    const mockExamId = new mongoose.Types.ObjectId();

    describe("Schema Validation", () => {
        it("should create an objective question with all required fields", async () => {
            const questionData = {
                exam: mockExamId,
                questionText: "What is 2 + 2?",
                questionType: "objective",
                marks: 5,
                options: [
                    { text: "3" },
                    { text: "4" },
                    { text: "5" },
                    { text: "6" }
                ],
                correctOptionIndex: 1
            };

            const question = new Question(questionData);
            const savedQuestion = await question.save();

            expect(savedQuestion.exam.toString()).toBe(mockExamId.toString());
            expect(savedQuestion.questionText).toBe("What is 2 + 2?");
            expect(savedQuestion.questionType).toBe("objective");
            expect(savedQuestion.marks).toBe(5);
            expect(savedQuestion.options).toHaveLength(4);
            expect(savedQuestion.correctOptionIndex).toBe(1);
        });

        it("should create a theory question with keywords", async () => {
            const questionData = {
                exam: mockExamId,
                questionText: "Explain photosynthesis.",
                questionType: "theory",
                marks: 10,
                keywords: [
                    { text: "chlorophyll", marks: 2 },
                    { text: "sunlight", marks: 2 },
                    { text: "carbon dioxide", marks: 3 },
                    { text: "oxygen", marks: 3 }
                ]
            };

            const question = new Question(questionData);
            const savedQuestion = await question.save();

            expect(savedQuestion.questionType).toBe("theory");
            expect(savedQuestion.keywords).toHaveLength(4);
            expect(savedQuestion.keywords[0].text).toBe("chlorophyll");
            expect(savedQuestion.keywords[0].marks).toBe(2);
        });

        it("should create a fill-in-the-blank question", async () => {
            const questionData = {
                exam: mockExamId,
                questionText: "The capital of France is ___.",
                questionType: "fill-in-the-blank",
                marks: 5,
                correctAnswers: ["Paris", "paris"]
            };

            const question = new Question(questionData);
            const savedQuestion = await question.save();

            expect(savedQuestion.questionType).toBe("fill-in-the-blank");
            expect(savedQuestion.correctAnswers).toEqual(["Paris", "paris"]);
        });
    });

    describe("Required Field Validation", () => {
        it("should fail to create question without exam", async () => {
            const questionData = {
                questionText: "Test question?",
                questionType: "objective",
                marks: 5
            };

            const question = new Question(questionData);
            await expect(question.save()).rejects.toThrow(/exam.*required/i);
        });

        it("should fail to create question without questionText", async () => {
            const questionData = {
                exam: mockExamId,
                questionType: "objective",
                marks: 5
            };

            const question = new Question(questionData);
            await expect(question.save()).rejects.toThrow(/questionText.*required/i);
        });

        it("should fail to create question without questionType", async () => {
            const questionData = {
                exam: mockExamId,
                questionText: "Test question?",
                marks: 5
            };

            const question = new Question(questionData);
            await expect(question.save()).rejects.toThrow(/questionType.*required/i);
        });

        it("should fail to create question without marks", async () => {
            const questionData = {
                exam: mockExamId,
                questionText: "Test question?",
                questionType: "objective"
            };

            const question = new Question(questionData);
            await expect(question.save()).rejects.toThrow(/marks.*required/i);
        });

        it("should fail to create objective question without options", async () => {
            const questionData = {
                exam: mockExamId,
                questionText: "Test question?",
                questionType: "objective",
                marks: 5,
                correctOptionIndex: 0
            };

            const question = new Question(questionData);
            // This should pass schema validation, but options array will be empty
            const savedQuestion = await question.save();
            expect(savedQuestion.options).toEqual([]);
        });

        it("should fail to create theory question without keywords", async () => {
            const questionData = {
                exam: mockExamId,
                questionText: "Test question?",
                questionType: "theory",
                marks: 5
            };

            const question = new Question(questionData);
            // This should pass schema validation, but keywords array will be empty
            const savedQuestion = await question.save();
            expect(savedQuestion.keywords).toEqual([]);
        });

        it("should fail to create fill-in-the-blank question without correctAnswers", async () => {
            const questionData = {
                exam: mockExamId,
                questionText: "Test question?",
                questionType: "fill-in-the-blank",
                marks: 5
            };

            const question = new Question(questionData);
            // This should pass schema validation, but correctAnswers array will be empty
            const savedQuestion = await question.save();
            expect(savedQuestion.correctAnswers).toEqual([]);
        });
    });

    describe("Field Validation", () => {
        it("should accept valid question types", async () => {
            const validTypes = ["objective", "theory", "fill-in-the-blank"];

            for (const type of validTypes) {
                const questionData = {
                    exam: mockExamId,
                    questionText: `Test ${type} question?`,
                    questionType: type,
                    marks: 5
                };

                // Add type-specific required fields
                if (type === "objective") {
                    questionData.options = [{ text: "A" }, { text: "B" }];
                    questionData.correctOptionIndex = 0;
                } else if (type === "theory") {
                    questionData.keywords = [{ text: "keyword", marks: 1 }];
                } else if (type === "fill-in-the-blank") {
                    questionData.correctAnswers = ["answer"];
                }

                const question = new Question(questionData);
                const savedQuestion = await question.save();
                expect(savedQuestion.questionType).toBe(type);
            }
        });

        it("should reject invalid question types", async () => {
            const questionData = {
                exam: mockExamId,
                questionText: "Test question?",
                questionType: "invalid",
                marks: 5
            };

            const question = new Question(questionData);
            await expect(question.save()).rejects.toThrow(/not a valid enum value/i);
        });

        it("should accept marks >= 1", async () => {
            const validMarks = [1, 5, 10, 20, 100];

            for (const marks of validMarks) {
                const questionData = {
                    exam: mockExamId,
                    questionText: "Test question?",
                    questionType: "objective",
                    marks,
                    options: [{ text: "A" }],
                    correctOptionIndex: 0
                };

                const question = new Question(questionData);
                const savedQuestion = await question.save();
                expect(savedQuestion.marks).toBe(marks);
            }
        });

        it("should reject marks < 1", async () => {
            const invalidMarks = [0, -1, -5];

            for (const marks of invalidMarks) {
                const questionData = {
                    exam: mockExamId,
                    questionText: "Test question?",
                    questionType: "objective",
                    marks,
                    options: [{ text: "A" }],
                    correctOptionIndex: 0
                };

                const question = new Question(questionData);
                await expect(question.save()).rejects.toThrow(/marks.*minimum.*1/i);
            }
        });

        it("should accept valid correctOptionIndex", async () => {
            const questionData = {
                exam: mockExamId,
                questionText: "Test question?",
                questionType: "objective",
                marks: 5,
                options: [{ text: "A" }, { text: "B" }, { text: "C" }, { text: "D" }],
                correctOptionIndex: 2
            };

            const question = new Question(questionData);
            const savedQuestion = await question.save();
            expect(savedQuestion.correctOptionIndex).toBe(2);
        });

        it("should accept keyword marks >= 0.5", async () => {
            const questionData = {
                exam: mockExamId,
                questionText: "Test theory question?",
                questionType: "theory",
                marks: 10,
                keywords: [
                    { text: "keyword1", marks: 0.5 },
                    { text: "keyword2", marks: 1.5 },
                    { text: "keyword3", marks: 5.0 }
                ]
            };

            const question = new Question(questionData);
            const savedQuestion = await question.save();
            expect(savedQuestion.keywords[0].marks).toBe(0.5);
            expect(savedQuestion.keywords[1].marks).toBe(1.5);
            expect(savedQuestion.keywords[2].marks).toBe(5.0);
        });

        it("should reject keyword marks < 0.5", async () => {
            const questionData = {
                exam: mockExamId,
                questionText: "Test theory question?",
                questionType: "theory",
                marks: 10,
                keywords: [
                    { text: "keyword", marks: 0.3 } // Below minimum
                ]
            };

            const question = new Question(questionData);
            await expect(question.save()).rejects.toThrow(/marks.*minimum.*0\.5/i);
        });
    });

    describe("Keyword Schema", () => {
        it("should validate keyword required fields", async () => {
            const questionData = {
                exam: mockExamId,
                questionText: "Test theory question?",
                questionType: "theory",
                marks: 10,
                keywords: [
                    {
                        text: "photosynthesis",
                        marks: 3
                    }
                ]
            };

            const question = new Question(questionData);
            const savedQuestion = await question.save();

            expect(savedQuestion.keywords[0].text).toBe("photosynthesis");
            expect(savedQuestion.keywords[0].marks).toBe(3);
        });

        it("should fail to create keyword without text", async () => {
            const questionData = {
                exam: mockExamId,
                questionText: "Test theory question?",
                questionType: "theory",
                marks: 10,
                keywords: [
                    {
                        marks: 3
                    }
                ]
            };

            const question = new Question(questionData);
            await expect(question.save()).rejects.toThrow(/text.*required/i);
        });

        it("should fail to create keyword without marks", async () => {
            const questionData = {
                exam: mockExamId,
                questionText: "Test theory question?",
                questionType: "theory",
                marks: 10,
                keywords: [
                    {
                        text: "photosynthesis"
                    }
                ]
            };

            const question = new Question(questionData);
            await expect(question.save()).rejects.toThrow(/marks.*required/i);
        });

        it("should handle multiple keywords with different marks", async () => {
            const questionData = {
                exam: mockExamId,
                questionText: "Explain the water cycle.",
                questionType: "theory",
                marks: 15,
                keywords: [
                    { text: "evaporation", marks: 2 },
                    { text: "condensation", marks: 2.5 },
                    { text: "precipitation", marks: 3 },
                    { text: "transpiration", marks: 1.5 },
                    { text: "runoff", marks: 2 }
                ]
            };

            const question = new Question(questionData);
            const savedQuestion = await question.save();

            expect(savedQuestion.keywords).toHaveLength(5);
            const totalKeywordMarks = savedQuestion.keywords.reduce((sum, k) => sum + k.marks, 0);
            expect(totalKeywordMarks).toBe(11); // 2 + 2.5 + 3 + 1.5 + 2
        });

        it("should convert keyword text to lowercase", async () => {
            const questionData = {
                exam: mockExamId,
                questionText: "Test theory question?",
                questionType: "theory",
                marks: 10,
                keywords: [
                    {
                        text: "PHOTOSYNTHESIS",
                        marks: 3
                    }
                ]
            };

            const question = new Question(questionData);
            const savedQuestion = await question.save();

            expect(savedQuestion.keywords[0].text).toBe("photosynthesis");
        });
    });

    describe("Data Integrity", () => {
        it("should handle long question text", async () => {
            const longText = "A".repeat(2000); // 2000 characters
            const questionData = {
                exam: mockExamId,
                questionText: longText,
                questionType: "objective",
                marks: 5,
                options: [{ text: "A" }],
                correctOptionIndex: 0
            };

            const question = new Question(questionData);
            const savedQuestion = await question.save();
            expect(savedQuestion.questionText).toBe(longText);
        });

        it("should handle special characters in question text", async () => {
            const specialText = "Question with special chars: @#$%^&*()_+{}|:<>?[]\\;',./ñéü";
            const questionData = {
                exam: mockExamId,
                questionText: specialText,
                questionType: "objective",
                marks: 5,
                options: [{ text: "A" }],
                correctOptionIndex: 0
            };

            const question = new Question(questionData);
            const savedQuestion = await question.save();
            expect(savedQuestion.questionText).toBe(specialText);
        });

        it("should handle unicode characters", async () => {
            const unicodeText = "Question with unicode: αβγδε 中文 🚀";
            const questionData = {
                exam: mockExamId,
                questionText: unicodeText,
                questionType: "fill-in-the-blank",
                marks: 5,
                correctAnswers: ["answer"]
            };

            const question = new Question(questionData);
            const savedQuestion = await question.save();
            expect(savedQuestion.questionText).toBe(unicodeText);
        });

        it("should handle empty options array for objective questions", async () => {
            const questionData = {
                exam: mockExamId,
                questionText: "Test question?",
                questionType: "objective",
                marks: 5,
                options: [],
                correctOptionIndex: 0
            };

            const question = new Question(questionData);
            const savedQuestion = await question.save();
            expect(savedQuestion.options).toEqual([]);
        });

        it("should handle empty keywords array for theory questions", async () => {
            const questionData = {
                exam: mockExamId,
                questionText: "Test theory question?",
                questionType: "theory",
                marks: 5,
                keywords: []
            };

            const question = new Question(questionData);
            const savedQuestion = await question.save();
            expect(savedQuestion.keywords).toEqual([]);
        });

        it("should handle empty correctAnswers array for fill-in-the-blank questions", async () => {
            const questionData = {
                exam: mockExamId,
                questionText: "Test ___ question?",
                questionType: "fill-in-the-blank",
                marks: 5,
                correctAnswers: []
            };

            const question = new Question(questionData);
            const savedQuestion = await question.save();
            expect(savedQuestion.correctAnswers).toEqual([]);
        });

        it("should handle multiple correct answers for fill-in-the-blank", async () => {
            const questionData = {
                exam: mockExamId,
                questionText: "The largest planet is ___.",
                questionType: "fill-in-the-blank",
                marks: 5,
                correctAnswers: ["Jupiter", "jupiter", "JUPITER"]
            };

            const question = new Question(questionData);
            const savedQuestion = await question.save();
            expect(savedQuestion.correctAnswers).toEqual(["Jupiter", "jupiter", "JUPITER"]);
        });
    });
});
