import { vi } from 'vitest';
import { describe, it, expect, beforeEach, afterEach, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import app from '../server.js';
import schoolController from '../controllers/schoolController.js';

let mongoServer;

describe('school Controller', () => {
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
    it('should fetch all schools', async () => {
      const response = await request(app)
        .get('/api/schools')
        .expect('Content-Type', /json/)
        .expect(200);

      expect(response.body).toBeDefined();
      expect(Array.isArray(response.body.data)).toBe(true);
    });

    it('should fetch a single school by ID', async () => {
      // Create a test school first
      const testData = {
        // Add appropriate test data fields
      };

      const createResponse = await request(app)
        .post('/api/schools')
        .send(testData);

      const id = createResponse.body.data._id;

      const response = await request(app)
        .get(`/api/schools/${id}`)
        .expect(200);

      expect(response.body.data._id).toBe(id);
    });

    it('should return 404 for non-existent school', async () => {
      const fakeId = new mongoose.Types.ObjectId();
      
      await request(app)
        .get(`/api/schools/${fakeId}`)
        .expect(404);
    });
  });

  describe('POST operations', () => {
    it('should create a new school', async () => {
      const testData = {
        // Add appropriate test data fields
      };

      const response = await request(app)
        .post('/api/schools')
        .send(testData)
        .expect(201);

      expect(response.body.data).toBeDefined();
      expect(response.body.success).toBe(true);
    });

    it('should validate required fields', async () => {
      const invalidData = {};

      await request(app)
        .post('/api/schools')
        .send(invalidData)
        .expect(400);
    });
  });

  describe('PUT operations', () => {
    it('should update an existing school', async () => {
      // Create a test school first
      const testData = {
        // Add appropriate test data fields
      };

      const createResponse = await request(app)
        .post('/api/schools')
        .send(testData);

      const id = createResponse.body.data._id;
      const updateData = {
        // Add update fields
      };

      const response = await request(app)
        .put(`/api/schools/${id}`)
        .send(updateData)
        .expect(200);

      expect(response.body.data).toBeDefined();
      expect(response.body.success).toBe(true);
    });
  });

  describe('DELETE operations', () => {
    it('should delete an existing school', async () => {
      // Create a test school first
      const testData = {
        // Add appropriate test data fields
      };

      const createResponse = await request(app)
        .post('/api/schools')
        .send(testData);

      const id = createResponse.body.data._id;

      await request(app)
        .delete(`/api/schools/${id}`)
        .expect(200);

      // Verify deletion
      await request(app)
        .get(`/api/schools/${id}`)
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
        .post('/api/schools')
        .send(testData)
        .expect(500);

      expect(response.body.success).toBe(false);
      expect(response.body.error).toBeDefined();
    });
  });
});
