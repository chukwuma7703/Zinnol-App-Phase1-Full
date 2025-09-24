import request from "supertest";
import app from "../../app.js";

describe("User Routes Integration Tests", () => {
  describe("POST /api/users/register", () => {
    it("should create a user successfully", async () => {
      const userData = {
        name: "Test User",
        email: "test@example.com",
        password: "password123"
      };

      const res = await request(app)
        .post("/api/users/register")
        .send(userData)
        .expect(201);

      expect(res.body.success).toBe(true);
      expect(res.body).toHaveProperty("data");
      expect(res.body.data.email).toBe(userData.email);
      expect(res.body.data.name).toBe(userData.name);
      expect(res.body.data).toHaveProperty("accessToken");
    });

    it("should return 400 for missing required fields", async () => {
      const incompleteData = {
        name: "Test User"
        // missing email and password
      };

      const res = await request(app)
        .post("/api/users/register")
        .send(incompleteData)
        .expect(400);

      expect(res.body).toHaveProperty("message");
      expect(res.body.message).toMatch(/required|validation/i);
    });

    it("should return 409 for duplicate email", async () => {
      const userData = {
        name: "Test User",
        email: "existing@example.com",
        password: "password123"
      };

      // First registration
      await request(app)
        .post("/api/users/register")
        .send(userData)
        .expect(201);

      // Second registration with same email
      const res = await request(app)
        .post("/api/users/register")
        .send(userData)
        .expect(409);

      expect(res.body).toHaveProperty("message");
      expect(res.body.message).toMatch(/exists|duplicate/i);
    });
  });

  describe("POST /api/users/login", () => {
    beforeAll(async () => {
      // Create a test user for login tests
      await request(app)
        .post("/api/users/register")
        .send({
          name: "Login Test User",
          email: "login@test.com",
          password: "password123"
        });
    });

    it("should login successfully with correct credentials", async () => {
      const loginData = {
        email: "login@test.com",
        password: "password123"
      };

      const res = await request(app)
        .post("/api/users/login")
        .send(loginData)
        .expect(200);

      expect(res.body.success).toBe(true);
      expect(res.body).toHaveProperty("data");
      expect(res.body.data.email).toBe(loginData.email);
      expect(res.body.data).toHaveProperty("accessToken");
      expect(res.body.data).toHaveProperty("refreshToken");
    });

    it("should return 401 for invalid credentials", async () => {
      const invalidLoginData = {
        email: "login@test.com",
        password: "wrongpassword"
      };

      const res = await request(app)
        .post("/api/users/login")
        .send(invalidLoginData)
        .expect(401);

      expect(res.body).toHaveProperty("message");
      expect(res.body.message).toMatch(/invalid|incorrect/i);
    });

    it("should return 400 for missing credentials", async () => {
      const res = await request(app)
        .post("/api/users/login")
        .send({})
        .expect(400);

      expect(res.body).toHaveProperty("message");
    });
  });

  describe("GET /api/users/me", () => {
    let accessToken;

    beforeAll(async () => {
      // Register and login to get token
      await request(app)
        .post("/api/users/register")
        .send({
          name: "Profile Test User",
          email: "profile@test.com",
          password: "password123"
        });

      const loginRes = await request(app)
        .post("/api/users/login")
        .send({
          email: "profile@test.com",
          password: "password123"
        });

      accessToken = loginRes.body.data.accessToken;
    });

    it("should return user profile with valid token", async () => {
      const res = await request(app)
        .get("/api/users/me")
        .set("Authorization", `Bearer ${accessToken}`)
        .expect(200);

      expect(res.body.success).toBe(true);
      expect(res.body).toHaveProperty("data");
      expect(res.body.data.email).toBe("profile@test.com");
      expect(res.body.data.name).toBe("Profile Test User");
    });

    it("should return 401 without authorization header", async () => {
      const res = await request(app)
        .get("/api/users/me")
        .expect(401);

      expect(res.body).toHaveProperty("message");
      expect(res.body.message).toMatch(/token|authorization/i);
    });

    it("should return 401 with invalid token", async () => {
      const res = await request(app)
        .get("/api/users/me")
        .set("Authorization", "Bearer invalid-token")
        .expect(401);

      expect(res.body).toHaveProperty("message");
    });
  });
});
