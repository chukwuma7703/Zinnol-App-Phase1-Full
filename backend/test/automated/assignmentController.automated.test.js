
import { vi } from 'vitest';
import { describe, it, expect, beforeEach, afterEach, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import app from '../server.js';

let mongoServer;
let token;
let resourceId;

describe('assignmentController Tests', () => {
  beforeAll(async () => {
    mongoServer = await MongoMemoryServer.create();
    const mongoUri = mongoServer.getUri();
    await mongoose.connect(mongoUri);

    // Setup authentication token
    const authResponse = await request(app)
      .post('/api/users/login')
      .send({ email: 'admin@example.com', password: 'admin123' });
    token = authResponse.body.accessToken;
  });

  afterAll(async () => {
    await mongoose.disconnect();
    await mongoServer.stop();
  });

  beforeEach(async () => {
    // Clear collections before each test
    const collections = mongoose.connection.collections;
    for (const key in collections) {
      await collections[key].deleteMany({});
    }
  });

  describe('Core Functionality', () => {

    it('should create a new resource', async () => {
      const data = { /* resource data */ };
      const response = await request(app)
        .post('/api/assignment')
        .set('Authorization', `Bearer ${token}`)
        .send(data);
      expect(response.status).toBe(201);
      expect(response.body.data).toMatchObject(data);
    });


    it('should fetch resource by ID', async () => {
      const response = await request(app)
        .get(`/api/assignment/${resourceId}`)
        .set('Authorization', `Bearer ${token}`);
      expect(response.status).toBe(200);
      expect(response.body.data._id).toBe(resourceId);
    });


    it('should update existing resource', async () => {
      const updates = { /* updated fields */ };
      const response = await request(app)
        .put(`/api/assignment/${resourceId}`)
        .set('Authorization', `Bearer ${token}`)
        .send(updates);
      expect(response.status).toBe(200);
      expect(response.body.data).toMatchObject(updates);
    });


    it('should delete resource', async () => {
      const response = await request(app)
        .delete(`/api/assignment/${resourceId}`)
        .set('Authorization', `Bearer ${token}`);
      expect(response.status).toBe(200);

      // Verify deletion
      const getResponse = await request(app)
        .get(`/api/assignment/${resourceId}`)
        .set('Authorization', `Bearer ${token}`);
      expect(getResponse.status).toBe(404);
    });


    it('should validate required fields', async () => {
      const invalidData = {}; // Missing required fields
      const response = await request(app)
        .post('/api/assignment')
        .set('Authorization', `Bearer ${token}`)
        .send(invalidData);
      expect(response.status).toBe(400);
      expect(response.body).toHaveProperty('error');
    });


    it('should validate field formats', async () => {
      const invalidData = {
        email: 'invalid-email',
        phone: '123', // Too short
        date: 'not-a-date'
      };
      const response = await request(app)
        .post('/api/assignment')
        .set('Authorization', `Bearer ${token}`)
        .send(invalidData);
      expect(response.status).toBe(400);
      expect(response.body.errors).toBeInstanceOf(Array);
    });


    it('should return 404 for non-existent resource', async () => {
      const fakeId = new mongoose.Types.ObjectId();
      const response = await request(app)
        .get(`/api/assignment/${fakeId}`)
        .set('Authorization', `Bearer ${token}`);
      expect(response.status).toBe(404);
      expect(response.body.error).toContain('not found');
    });


    it('should return 401 for unauthorized access', async () => {
      const response = await request(app).get('/api/assignment');
      expect(response.status).toBe(401);
      expect(response.body.error).toContain('authorized');
    });


    it('should handle server errors gracefully', async () => {
      // Mock database error
      vi.spyOn(Model.prototype, 'save').mockRejectedValueOnce(new Error('DB Error'));

      const response = await request(app)
        .post('/api/assignment')
        .set('Authorization', `Bearer ${token}`)
        .send(validData);
      expect(response.status).toBe(500);
      expect(response.body.error).toBeDefined();
    });
  });

  describe('Edge Cases', () => {
    it('should handle empty input gracefully', async () => {
      const response = await request(app)
        .post('/api/assignment')
        .set('Authorization', `Bearer ${token}`)
        .send({});
      expect(response.status).toBeGreaterThanOrEqual(400);
    });

    it('should handle malformed data', async () => {
      const response = await request(app)
        .post('/api/assignment')
        .set('Authorization', `Bearer ${token}`)
        .send('invalid json');
      expect(response.status).toBe(400);
    });

    it('should handle concurrent requests', async () => {
      const promises = Array(10).fill().map(() =>
        request(app)
          .get('/api/assignment')
          .set('Authorization', `Bearer ${token}`)
      );

      const responses = await Promise.all(promises);
      responses.forEach(response => {
        expect(response.status).toBe(200);
      });
    });
  });

  describe('Security', () => {
    it('should sanitize input to prevent injection', async () => {
      const maliciousData = {
        name: '<script>alert("XSS")</script>',
        description: { $ne: null } // NoSQL injection attempt
      };

      const response = await request(app)
        .post('/api/assignment')
        .set('Authorization', `Bearer ${token}`)
        .send(maliciousData);

      if (response.status === 201) {
        expect(response.body.data.name).not.toContain('<script>');
      }
    });

    it('should enforce rate limiting', async () => {
      const requests = Array(100).fill().map(() =>
        request(app).get('/api/assignment')
      );

      const responses = await Promise.all(requests);
      const rateLimited = responses.some(r => r.status === 429);
      expect(rateLimited).toBe(true);
    });
  });
});

// Helper functions
function generateData() {
  return {
    name: `Test ${Date.now()}`,
    description: 'Test description',
    // Add more fields as needed
  };
}

async function createSchool() {
  const response = await request(app)
    .post('/api/schools')
    .set('Authorization', `Bearer ${token}`)
    .send({ name: 'Test School', address: '123 Test St' });
  return response.body.data;
}

async function createTeacher(schoolId) {
  const response = await request(app)
    .post('/api/teachers')
    .set('Authorization', `Bearer ${token}`)
    .send({ name: 'Test Teacher', email: 'teacher@test.com', school: schoolId });
  return response.body.data;
}

async function createStudent(schoolId) {
  const response = await request(app)
    .post('/api/students')
    .set('Authorization', `Bearer ${token}`)
    .send({ name: 'Test Student', email: 'student@test.com', school: schoolId });
  return response.body.data;
}

async function createAssignment(teacherId, schoolId) {
  const response = await request(app)
    .post('/api/assignments')
    .set('Authorization', `Bearer ${token}`)
    .send({
      title: 'Test Assignment',
      teacher: teacherId,
      school: schoolId,
      dueDate: new Date(Date.now() + 86400000)
    });
  return response.body.data;
}

async function submitAssignment(assignmentId, studentId) {
  const response = await request(app)
    .post('/api/assignments/submit')
    .set('Authorization', `Bearer ${token}`)
    .send({
      assignment: assignmentId,
      student: studentId,
      content: 'Test submission'
    });
  return response.body.data;
}
