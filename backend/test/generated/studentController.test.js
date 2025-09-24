import { vi } from 'vitest';
import { describe, it, expect, beforeEach, afterEach, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import app from '../server.js';
import studentController from '../controllers/studentController.js';

let mongoServer;

describe('student Controller', () => {
  beforeAll(async () => {
    mongoServer = await MongoMemoryServer.create();
    const mongoUri = mongoServer.getUri();
    await mongoose.connect(mongoUri);
  });

  afterAll(async () => {
    await mongoose.disconnect();
    await mongoServer.stop();
  });

  beforeEach(async () => {
    // Clear all collections before each test
    const collections = mongoose.connection.collections;
    for (const key in collections) {
      await collections[key].deleteMany({});
    }
  });

  describe('GET operations', () => {
    it('should fetch all students', async () => {
      const response = await request(app)
        .get('/api/students')
        .expect('Content-Type', /json/)
        .expect(200);

      expect(response.body).toBeDefined();
      expect(Array.isArray(response.body.data)).toBe(true);
    });

    it('should fetch a single student by ID', async () => {
      // Create a test student first
      const testData = {
        // Add appropriate test data fields
      };

      const createResponse = await request(app)
        .post('/api/students')
        .send(testData);

      const id = createResponse.body.data._id;

      const response = await request(app)
        .get(`/api/students/${id}`)
        .expect(200);

      expect(response.body.data._id).toBe(id);
    });

    it('should return 404 for non-existent student', async () => {
      const fakeId = new mongoose.Types.ObjectId();
      
      await request(app)
        .get(`/api/students/${fakeId}`)
        .expect(404);
    });
  });

  describe('POST operations', () => {
    it('should create a new student', async () => {
      const testData = {
        // Add appropriate test data fields
      };

      const response = await request(app)
        .post('/api/students')
        .send(testData)
        .expect(201);

      expect(response.body.data).toBeDefined();
      expect(response.body.success).toBe(true);
    });

    it('should validate required fields', async () => {
      const invalidData = {};

      await request(app)
        .post('/api/students')
        .send(invalidData)
        .expect(400);
    });
  });

  describe('PUT operations', () => {
    it('should update an existing student', async () => {
      // Create a test student first
      const testData = {
        // Add appropriate test data fields
      };

      const createResponse = await request(app)
        .post('/api/students')
        .send(testData);

      const id = createResponse.body.data._id;
      const updateData = {
        // Add update fields
      };

      const response = await request(app)
        .put(`/api/students/${id}`)
        .send(updateData)
        .expect(200);

      expect(response.body.data).toBeDefined();
      expect(response.body.success).toBe(true);
    });
  });

  describe('DELETE operations', () => {
    it('should delete an existing student', async () => {
      // Create a test student first
      const testData = {
        // Add appropriate test data fields
      };

      const createResponse = await request(app)
        .post('/api/students')
        .send(testData);

      const id = createResponse.body.data._id;

      await request(app)
        .delete(`/api/students/${id}`)
        .expect(200);

      // Verify deletion
      await request(app)
        .get(`/api/students/${id}`)
        .expect(404);
    });
  });

  describe('Error handling', () => {
    it('should handle database errors gracefully', async () => {
      // Mock a database error
      vi.spyOn(mongoose.Model.prototype, 'save').mockRejectedValueOnce(new Error('Database error'));

      const testData = {
        // Add appropriate test data fields
      };

      const response = await request(app)
        .post('/api/students')
        .send(testData)
        .expect(500);

      expect(response.body.success).toBe(false);
      expect(response.body.error).toBeDefined();
    });
  });
});
