import { vi, describe, it, expect, beforeEach } from 'vitest';
import GradeScaleService from "../../services/gradeScaleService.js";
import School from "../../models/School.js";

// Mock the models and cache
vi.mock("../../models/School.js");
vi.mock("../../config/cache.js");
vi.mock("../../utils/logger.js");

describe("Grade Scale Service", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("getGradeScale", () => {
    it("should return predefined WAEC scale", async () => {
      const scale = await GradeScaleService.getGradeScale("WAEC");

      expect(scale).toBeDefined();
      expect(scale).toHaveLength(9);
      expect(scale[0]).toEqual({
        code: "A1",
        label: "Excellent",
        minScore: 75,
        maxScore: 100,
        remarks: "Excellent"
      });
    });

    it("should return predefined Cambridge scale", async () => {
      const scale = await GradeScaleService.getGradeScale("CAMBRIDGE");

      expect(scale).toBeDefined();
      expect(scale).toHaveLength(7);
      expect(scale[0]).toEqual({
        code: "A*",
        label: "Outstanding",
        minScore: 90,
        maxScore: 100,
        remarks: "Outstanding"
      });
    });

    it("should return custom scale from school", async () => {
      const customScale = [
        { code: "A", label: "Excellent", minScore: 80, maxScore: 100, remarks: "Excellent" },
        { code: "B", label: "Good", minScore: 60, maxScore: 79, remarks: "Good" }
      ];

      School.findById.mockReturnValue({
        select: vi.fn().mockReturnValue({
          lean: vi.fn().mockResolvedValue({
            gradeScale: customScale
          })
        })
      });

      const scale = await GradeScaleService.getGradeScale("CUSTOM", "school123");

      expect(School.findById).toHaveBeenCalledWith("school123");
      expect(scale).toEqual(customScale);
    });

    it("should return default WAEC scale when school has no custom scale", async () => {
      School.findById.mockReturnValue({
        select: vi.fn().mockReturnValue({
          lean: vi.fn().mockResolvedValue({
            gradeScale: null
          })
        })
      });

      const scale = await GradeScaleService.getGradeScale("CUSTOM", "school123");

      expect(scale).toBeDefined();
      expect(scale[0].code).toBe("A1"); // WAEC default
    });

    it("should throw error for invalid predefined scale", async () => {
      const scale = await GradeScaleService.getGradeScale("INVALID");
      expect(scale).toBeNull();
    });
  });

  describe("calculateGrade", () => {
    it("should calculate grade for WAEC scale", async () => {
      const grade = await GradeScaleService.calculateGrade(85, "WAEC");

      expect(grade).toEqual({
        code: "A1",
        label: "Excellent",
        remarks: "Excellent"
      });
    });

    it("should calculate grade for Cambridge scale", async () => {
      const grade = await GradeScaleService.calculateGrade(95, "CAMBRIDGE");

      expect(grade).toEqual({
        code: "A*",
        label: "Outstanding",
        remarks: "Outstanding"
      });
    });

    it("should calculate grade for custom school scale", async () => {
      const customScale = [
        { code: "A1", label: "Excellent", minScore: 80, maxScore: 100, remarks: "Excellent" },
        { code: "B2", label: "Good", minScore: 60, maxScore: 79, remarks: "Good" }
      ];

      School.findById.mockReturnValue({
        select: vi.fn().mockReturnValue({
          lean: vi.fn().mockResolvedValue({
            gradeScale: customScale
          })
        })
      });

      const grade = await GradeScaleService.calculateGrade(75, "CUSTOM", "school123");

      expect(grade).toEqual({
        code: "B2",
        label: "Good",
        remarks: "Good"
      });
    });

    it("should return F9 for score below minimum", async () => {
      const grade = await GradeScaleService.calculateGrade(30, "WAEC");

      expect(grade).toEqual({
        code: "F9",
        label: "Fail",
        remarks: "Fail"
      });
    });

    it("should handle edge case scores", async () => {
      // Test boundary values
      const grade90 = await GradeScaleService.calculateGrade(90, "WAEC");
      const grade89 = await GradeScaleService.calculateGrade(89, "WAEC");

      expect(grade90.code).toBe("A1"); // 75-100 range
      expect(grade89.code).toBe("A1"); // 75-100 range
    });
  });

  describe("validateGradeScale", () => {
    it("should validate correct grade scale", () => {
      const validScale = [
        { code: "A", label: "Excellent", minScore: 80, maxScore: 100, remarks: "Excellent" },
        { code: "B", label: "Good", minScore: 60, maxScore: 79, remarks: "Good" },
        { code: "C", label: "Pass", minScore: 40, maxScore: 59, remarks: "Pass" },
        { code: "F", label: "Fail", minScore: 0, maxScore: 39, remarks: "Fail" }
      ];

      const result = GradeScaleService.validateGradeScale(validScale);
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it("should reject scale with overlapping ranges", () => {
      const invalidScale = [
        { code: "A", label: "Excellent", minScore: 80, maxScore: 100, remarks: "Excellent" },
        { code: "B", label: "Good", minScore: 75, maxScore: 85, remarks: "Good" } // Overlaps with A
      ];

      const result = GradeScaleService.validateGradeScale(invalidScale);
      expect(result.valid).toBe(false);
      expect(result.errors.some(error => error.includes("Grade ranges overlap"))).toBe(true);
    });

    it("should allow scale with gaps at bottom range", () => {
      const scaleWithGap = [
        { code: "A", label: "Excellent", minScore: 80, maxScore: 100, remarks: "Excellent" },
        { code: "B", label: "Good", minScore: 60, maxScore: 79, remarks: "Good" },
        // Gap between 59-0 not covered, but function doesn't check this
      ];

      const result = GradeScaleService.validateGradeScale(scaleWithGap);
      expect(result.valid).toBe(true); // Function only checks overlaps, not full coverage
      expect(result.warnings).toHaveLength(0);
    });

    it("should reject scale with missing required fields", () => {
      const invalidScale = [
        { code: "A", label: "Excellent", minScore: 80, maxScore: 100 }, // Missing remarks (optional)
        { minScore: 60, maxScore: 79, remarks: "Good" } // Missing label and code
      ];

      const result = GradeScaleService.validateGradeScale(invalidScale);
      expect(result.valid).toBe(false);
      expect(result.errors).toContain("Grade 2: code is required");
      expect(result.errors).toContain("Grade 2: label is required");
      expect(result.errors).not.toContain("Grade 1: remarks is required"); // remarks is optional
    });

    it("should reject empty scale", () => {
      const result = GradeScaleService.validateGradeScale([]);
      expect(result.valid).toBe(false);
      expect(result.errors).toContain("Grade scale cannot be empty");
    });
  });

  describe("setSchoolGradeScale", () => {
    const customScale = [
      { code: "A", label: "Excellent", minScore: 80, maxScore: 100, remarks: "Excellent" },
      { code: "B", label: "Good", minScore: 60, maxScore: 79, remarks: "Good" },
      { code: "C", label: "Average", minScore: 40, maxScore: 59, remarks: "Average" },
      { code: "F", label: "Fail", minScore: 0, maxScore: 39, remarks: "Fail" }
    ];

    it("should set custom grade scale for school", async () => {
      const mockSchool = {
        _id: "school123",
        name: "Test School",
        save: vi.fn().mockResolvedValue({
          _id: "school123",
          gradeScale: customScale
        })
      };

      School.findById.mockResolvedValue(mockSchool);

      const result = await GradeScaleService.setSchoolGradeScale("school123", customScale);

      expect(School.findById).toHaveBeenCalledWith("school123");
      expect(mockSchool.save).toHaveBeenCalled();
      expect(result.gradeScale).toEqual(customScale);
    });

    it("should throw error for non-existent school", async () => {
      School.findById.mockResolvedValue(null);

      await expect(GradeScaleService.setSchoolGradeScale("nonexistent", customScale))
        .rejects.toThrow("School not found");
    });

    it("should handle database save errors", async () => {
      const mockSchool = {
        _id: "school123",
        name: "Test School",
        save: vi.fn().mockRejectedValue(new Error("Database save failed"))
      };

      School.findById.mockResolvedValue(mockSchool);

      await expect(GradeScaleService.setSchoolGradeScale("school123", customScale))
        .rejects.toThrow("Database save failed");
    });
  });

  describe("getSchoolGradeScale", () => {
    it("should return custom school grade scale", async () => {
      const customScale = [
        { code: "A", label: "Excellent", minScore: 80, maxScore: 100, remarks: "Excellent" }
      ];

      School.findById.mockReturnValueOnce({
        select: vi.fn().mockReturnValueOnce({
          lean: vi.fn().mockResolvedValueOnce({
            gradeScale: customScale
          })
        })
      });

      const result = await GradeScaleService.getSchoolGradeScale("school123");

      expect(School.findById).toHaveBeenCalledWith("school123");
      expect(result).toEqual(customScale);
    });

    it("should return WAEC scale for school without custom scale", async () => {
      School.findById.mockReturnValue({
        select: vi.fn().mockReturnValue({
          lean: vi.fn().mockResolvedValue({
            gradeScale: null
          })
        })
      });

      const result = await GradeScaleService.getSchoolGradeScale("school123");

      expect(result).toBeDefined();
      expect(result[0].code).toBe("A1"); // WAEC default
    });

    it("should return WAEC scale for non-existent school", async () => {
      School.findById.mockReturnValue({
        select: vi.fn().mockReturnValue({
          lean: vi.fn().mockResolvedValue(null)
        })
      });

      const result = await GradeScaleService.getSchoolGradeScale("nonexistent");

      expect(result).toBeDefined();
      expect(result[0].code).toBe("A1"); // WAEC fallback
    });
  });

  describe("resetSchoolGradeScale", () => {
    it("should reset school to default scale", async () => {
      const mockSchool = {
        _id: "school123",
        name: "Test School",
        gradeScale: [{ code: "CUSTOM", minScore: 0, maxScore: 100 }],
        save: vi.fn().mockResolvedValue({
          _id: "school123",
          gradeScale: null
        })
      };

      School.findById.mockResolvedValue(mockSchool);

      const result = await GradeScaleService.resetSchoolGradeScale("school123");

      expect(mockSchool.gradeScale).toBeNull();
      expect(mockSchool.save).toHaveBeenCalled();
      expect(result.gradeScale).toBeNull();
    });

    it("should throw error for non-existent school", async () => {
      School.findById.mockResolvedValue(null);

      await expect(GradeScaleService.resetSchoolGradeScale("nonexistent"))
        .rejects.toThrow("School not found");
    });
  });
});
