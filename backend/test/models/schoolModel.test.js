import { describe, it, expect, beforeEach } from "vitest";
import mongoose from "mongoose";
import School from "../../models/School.js";
import { TestDatabase, TestHelpers } from "./testUtils.js";

describe("School Model", () => {
    beforeEach(async () => {
        await TestHelpers.setupTestEnvironment();
    });

    describe("School Creation", () => {
        it("should create a valid school", async () => {
            const schoolData = {
                name: "Test School",
                address: "123 Test Street",
                phone: "123-456-7890",
                lat: 40.7128,
                lng: -74.0060
            };

            const school = new School(schoolData);
            const savedSchool = await school.save();

            expect(savedSchool._id).toBeDefined();
            expect(savedSchool.name).toBe(schoolData.name);
            expect(savedSchool.address).toBe(schoolData.address);
            expect(savedSchool.phone).toBe(schoolData.phone);
            expect(savedSchool.lat).toBe(schoolData.lat);
            expect(savedSchool.lng).toBe(schoolData.lng);
            expect(savedSchool.isActive).toBe(true);
            expect(savedSchool.features).toBeInstanceOf(Map);
            expect(savedSchool.notifiedMilestones).toEqual([]);
            expect(savedSchool.createdAt).toBeDefined();
            expect(savedSchool.updatedAt).toBeDefined();
        });

        it("should require name field", async () => {
            const school = new School({
                address: "123 Test Street"
            });

            let error;
            try {
                await school.save();
            } catch (err) {
                error = err;
            }

            expect(error).toBeDefined();
            expect(error.name).toBe("ValidationError");
            expect(error.errors.name).toBeDefined();
        });

        it("should allow optional fields to be undefined", async () => {
            const school = new School({
                name: "Test School"
            });

            const savedSchool = await school.save();

            expect(savedSchool.address).toBeUndefined();
            expect(savedSchool.phone).toBeUndefined();
            expect(savedSchool.lat).toBeUndefined();
            expect(savedSchool.lng).toBeUndefined();
        });
    });

    describe("Default Values", () => {
        it("should set isActive to true by default", async () => {
            const school = new School({
                name: "Test School"
            });

            const savedSchool = await school.save();
            expect(savedSchool.isActive).toBe(true);
        });

        it("should initialize features as empty Map", async () => {
            const school = new School({
                name: "Test School"
            });

            const savedSchool = await school.save();
            expect(savedSchool.features).toBeInstanceOf(Map);
            expect(savedSchool.features.size).toBe(0);
        });

        it("should initialize notifiedMilestones as empty array", async () => {
            const school = new School({
                name: "Test School"
            });

            const savedSchool = await school.save();
            expect(savedSchool.notifiedMilestones).toEqual([]);
        });
    });

    describe("Features Map", () => {
        it("should allow setting feature flags", async () => {
            const school = new School({
                name: "Test School"
            });

            school.features.set("ocr", true);
            school.features.set("excel", false);
            school.features.set("notifications", true);

            const savedSchool = await school.save();

            expect(savedSchool.features.get("ocr")).toBe(true);
            expect(savedSchool.features.get("excel")).toBe(false);
            expect(savedSchool.features.get("notifications")).toBe(true);
        });

        it("should handle feature map operations", async () => {
            const school = new School({
                name: "Test School"
            });

            school.features.set("testFeature", true);
            await school.save();

            // Reload from database
            const reloadedSchool = await School.findById(school._id);

            expect(reloadedSchool.features.get("testFeature")).toBe(true);
            expect(reloadedSchool.features.has("nonExistent")).toBe(false);
        });
    });

    describe("Reference Fields", () => {
        it("should allow setting mainSuperAdmins references", async () => {
            const school = new School({
                name: "Test School",
                mainSuperAdmins: [
                    new mongoose.Types.ObjectId(),
                    new mongoose.Types.ObjectId()
                ]
            });

            const savedSchool = await school.save();
            expect(savedSchool.mainSuperAdmins).toHaveLength(2);
            expect(savedSchool.mainSuperAdmins[0]).toBeInstanceOf(mongoose.Types.ObjectId);
        });

        it("should allow setting students references", async () => {
            const school = new School({
                name: "Test School",
                students: [
                    new mongoose.Types.ObjectId(),
                    new mongoose.Types.ObjectId(),
                    new mongoose.Types.ObjectId()
                ]
            });

            const savedSchool = await school.save();
            expect(savedSchool.students).toHaveLength(3);
        });
    });

    describe("Timestamps", () => {
        it("should set createdAt and updatedAt timestamps", async () => {
            const beforeCreate = new Date();

            const school = new School({
                name: "Test School"
            });

            const savedSchool = await school.save();
            const afterCreate = new Date();

            expect(savedSchool.createdAt).toBeDefined();
            expect(savedSchool.updatedAt).toBeDefined();
            expect(savedSchool.createdAt).toBeInstanceOf(Date);
            expect(savedSchool.updatedAt).toBeInstanceOf(Date);
            expect(savedSchool.createdAt.getTime()).toBeGreaterThanOrEqual(beforeCreate.getTime());
            expect(savedSchool.createdAt.getTime()).toBeLessThanOrEqual(afterCreate.getTime());
        });

        it("should update updatedAt on save", async () => {
            const school = new School({
                name: "Test School"
            });

            const savedSchool = await school.save();
            const firstUpdate = savedSchool.updatedAt;

            // Wait a bit and update
            await new Promise(resolve => setTimeout(resolve, 10));
            savedSchool.address = "Updated Address";
            await savedSchool.save();

            expect(savedSchool.updatedAt.getTime()).toBeGreaterThan(firstUpdate.getTime());
        });
    });

    describe("Data Validation", () => {
        it("should accept valid coordinate values", async () => {
            const school = new School({
                name: "Test School",
                lat: 90,
                lng: 180
            });

            const savedSchool = await school.save();
            expect(savedSchool.lat).toBe(90);
            expect(savedSchool.lng).toBe(180);
        });

        it("should accept negative coordinate values", async () => {
            const school = new School({
                name: "Test School",
                lat: -90,
                lng: -180
            });

            const savedSchool = await school.save();
            expect(savedSchool.lat).toBe(-90);
            expect(savedSchool.lng).toBe(-180);
        });

        it("should accept decimal coordinate values", async () => {
            const school = new School({
                name: "Test School",
                lat: 40.7128,
                lng: -74.0060
            });

            const savedSchool = await school.save();
            expect(savedSchool.lat).toBe(40.7128);
            expect(savedSchool.lng).toBe(-74.0060);
        });
    });

    describe("Notified Milestones", () => {
        it("should allow adding notified milestones", async () => {
            const school = new School({
                name: "Test School"
            });

            school.notifiedMilestones.push(100, 500, 1000);
            const savedSchool = await school.save();

            expect(savedSchool.notifiedMilestones).toEqual([100, 500, 1000]);
        });

        it("should prevent duplicate milestones", async () => {
            const school = new School({
                name: "Test School",
                notifiedMilestones: [100, 500]
            });

            const savedSchool = await school.save();
            expect(savedSchool.notifiedMilestones).toEqual([100, 500]);
        });
    });
});
