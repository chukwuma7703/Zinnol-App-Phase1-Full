import request from "supertest";
import app from "../../app.js";
import mongoose from "mongoose";

describe("Import Test", () => {
    it("should import modules successfully", () => {
        expect(request).toBeDefined();
        expect(app).toBeDefined();
        expect(mongoose).toBeDefined();
    });
});
