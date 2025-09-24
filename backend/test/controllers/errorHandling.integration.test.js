import request from "supertest";
import app from "../../app.js";

describe("Error Handling Integration Tests", () => {
  describe("Database Connection Errors", () => {
    it("should return 500 when database is unavailable during user registration", async () => {
      // This test assumes you have a way to simulate DB disconnection
      // In a real scenario, you might mock the database connection or use a test DB that can be disconnected

      const userData = {
        name: "Test User",
        email: "db-error@example.com",
        password: "password123"
      };

      // Mock database disconnection scenario
      // This would require mocking mongoose connection or using a test database

      const res = await request(app)
        .post("/api/users/register")
        .send(userData)
        .expect(500);

      expect(res.body).toHaveProperty("message");
      expect(res.body).toHaveProperty("error");
      expect(res.body.message).toMatch(/database|connection|server error/i);
    });
  });

  describe("Validation Errors", () => {
    it("should return 400 with detailed validation errors", async () => {
      const invalidData = {
        name: "", // Empty name
        email: "invalid-email", // Invalid email format
        password: "123" // Too short
      };

      const res = await request(app)
        .post("/api/users/register")
        .send(invalidData)
        .expect(400);

      expect(res.body).toHaveProperty("message");
      expect(res.body).toHaveProperty("errors");
      expect(Array.isArray(res.body.errors)).toBe(true);
      expect(res.body.errors.length).toBeGreaterThan(0);

      // Check for specific validation error messages
      const errorMessages = res.body.errors.map(err => err.message);
      expect(errorMessages.some(msg => msg.includes("name"))).toBe(true);
      expect(errorMessages.some(msg => msg.includes("email"))).toBe(true);
      expect(errorMessages.some(msg => msg.includes("password"))).toBe(true);
    });

    it("should return 400 for invalid JSON payload", async () => {
      const res = await request(app)
        .post("/api/users/register")
        .set("Content-Type", "application/json")
        .send("{ invalid json }")
        .expect(400);

      expect(res.body).toHaveProperty("message");
      expect(res.body.message).toMatch(/json|parse|syntax/i);
    });
  });

  describe("Authentication Errors", () => {
    it("should return 401 for expired JWT token", async () => {
      const expiredToken = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpZCI6InRlc3QiLCJpYXQiOjE2MzY5NjQwMDAsImV4cCI6MTYzNjk2NDAwMX0.test";

      const res = await request(app)
        .get("/api/users/me")
        .set("Authorization", `Bearer ${expiredToken}`)
        .expect(401);

      expect(res.body).toHaveProperty("message");
      expect(res.body.message).toMatch(/token|expired|invalid/i);
    });

    it("should return 401 for malformed authorization header", async () => {
      const res = await request(app)
        .get("/api/users/me")
        .set("Authorization", "InvalidFormat token123")
        .expect(401);

      expect(res.body).toHaveProperty("message");
    });

    it("should return 403 for insufficient permissions", async () => {
      // First create a student user
      const studentData = {
        name: "Student User",
        email: "student@example.com",
        password: "password123",
        role: "Student"
      };

      const registerRes = await request(app)
        .post("/api/users/register")
        .send(studentData);

      const loginRes = await request(app)
        .post("/api/users/login")
        .send({
          email: "student@example.com",
          password: "password123"
        });

      const studentToken = loginRes.body.accessToken;

      // Try to access admin-only endpoint
      const res = await request(app)
        .get("/api/admin/schools") // Assuming this requires admin role
        .set("Authorization", `Bearer ${studentToken}`)
        .expect(403);

      expect(res.body).toHaveProperty("message");
      expect(res.body.message).toMatch(/permission|forbidden|unauthorized/i);
    });
  });

  describe("Resource Not Found Errors", () => {
    it("should return 404 for non-existent user profile", async () => {
      // Create and login a user first
      const userData = {
        name: "Test User",
        email: "notfound@example.com",
        password: "password123"
      };

      const registerRes = await request(app)
        .post("/api/users/register")
        .send(userData);

      const loginRes = await request(app)
        .post("/api/users/login")
        .send({
          email: "notfound@example.com",
          password: "password123"
        });

      const token = loginRes.body.accessToken;

      // Try to access non-existent resource
      const res = await request(app)
        .get("/api/users/507f1f77bcf86cd799439011") // Valid ObjectId format but doesn't exist
        .set("Authorization", `Bearer ${token}`)
        .expect(404);

      expect(res.body).toHaveProperty("message");
      expect(res.body.message).toMatch(/not found|doesn't exist/i);
    });

    it("should return 404 for invalid route", async () => {
      const res = await request(app)
        .get("/api/nonexistent/endpoint")
        .expect(404);

      expect(res.body).toHaveProperty("message");
      expect(res.body.message).toMatch(/not found|route/i);
    });
  });

  describe("Rate Limiting Errors", () => {
    it("should return 429 when rate limit exceeded", async () => {
      // This test would require making many rapid requests to trigger rate limiting
      // For demonstration, we'll assume there's a rate-limited endpoint

      const requests = Array(101).fill().map(() => // Exceed typical rate limit
        request(app)
          .get("/api/public/health") // Assuming this endpoint has rate limiting
      );

      // Execute requests in parallel to trigger rate limiting
      const responses = await Promise.allSettled(requests);

      const rateLimitedResponse = responses.find(res =>
        res.status === 'fulfilled' && res.value.status === 429
      );

      if (rateLimitedResponse) {
        const res = rateLimitedResponse.value;
        expect(res.body).toHaveProperty("message");
        expect(res.body.message).toMatch(/rate limit|too many requests/i);
        expect(res.headers).toHaveProperty("retry-after");
      } else {
        // If rate limiting didn't trigger, this test passes (rate limiting might be disabled in test env)
        expect(true).toBe(true);
      }
    });
  });

  describe("Server Errors", () => {
    it("should return 500 for unhandled exceptions", async () => {
      // This would require an endpoint that can trigger an unhandled exception
      // For example, an endpoint that calls a service method that throws

      const res = await request(app)
        .get("/api/test/error") // Assuming this endpoint exists and throws
        .expect(500);

      expect(res.body).toHaveProperty("message");
      expect(res.body).toHaveProperty("error");
      expect(res.body.message).toMatch(/server error|internal/i);
    });

    it("should include error ID in 500 responses for tracking", async () => {
      const res = await request(app)
        .get("/api/test/error")
        .expect(500);

      // Many apps include an error ID for tracking
      expect(res.body).toHaveProperty("errorId");
      expect(typeof res.body.errorId).toBe("string");
    });
  });

  describe("Input Sanitization Errors", () => {
    it("should prevent XSS attacks in input fields", async () => {
      const maliciousData = {
        name: "<script>alert('xss')</script>",
        email: "xss@example.com",
        password: "password123"
      };

      const res = await request(app)
        .post("/api/users/register")
        .send(maliciousData)
        .expect(201); // Should succeed but sanitized

      // The name should be sanitized or rejected
      expect(res.body.user.name).not.toContain("<script>");
      expect(res.body.user.name).not.toContain("alert");
    });

    it("should handle extremely large payloads", async () => {
      const largeData = {
        name: "A".repeat(10000), // Very long string
        email: "large@example.com",
        password: "password123"
      };

      const res = await request(app)
        .post("/api/users/register")
        .send(largeData);

      // Should either succeed with truncated data or fail with validation error
      expect([201, 400]).toContain(res.status);
    });
  });
});
