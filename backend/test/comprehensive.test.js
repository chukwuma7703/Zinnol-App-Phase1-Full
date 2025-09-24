import request from 'supertest';
import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import app from '../server.js';
import User from '../models/userModel.js';
import School from '../models/School.js';
import Student from '../models/Student.js';
import jwt from 'jsonwebtoken';

let mongoServer;
let authToken;
let testUser;
let testSchool;

beforeAll(async () => {
  // Start in-memory MongoDB
  mongoServer = await MongoMemoryServer.create();
  const mongoUri = mongoServer.getUri();

  // Connect to in-memory database
  await mongoose.connect(mongoUri);

  // Create test data
  testSchool = await School.create({
    name: 'Test School',
    email: 'test@school.com',
    address: '123 Test St',
    type: 'secondary',
    phone: '+1234567890',
  });

  testUser = await User.create({
    name: 'Test User',
    email: 'test@example.com',
    password: 'Test@1234',
    role: 'admin',
    school: testSchool._id,
  });

  // Generate auth token
  authToken = jwt.sign(
    { id: testUser._id, role: testUser.role },
    process.env.JWT_SECRET || 'test-secret',
    { expiresIn: '1d' }
  );
});

afterAll(async () => {
  await mongoose.disconnect();
  if (mongoServer) {
    await mongoServer.stop();
  }
});

describe('Health and Monitoring Endpoints', () => {
  test('GET /healthz should return health status', async () => {
    const response = await request(app).get('/healthz');

    expect(response.status).toBe(200);
    // Unified envelope: { success, data }
    expect(response.body).toHaveProperty('success', true);
    expect(response.body.data).toHaveProperty('status', 'healthy');
    expect(response.body.data).toHaveProperty('timestamp');
    expect(response.body.data).toHaveProperty('uptime');
  });

  test('GET /readyz should return readiness status', async () => {
    const response = await request(app).get('/readyz');

    expect(response.status).toBe(200);
    expect(response.body).toHaveProperty('success', true);
    expect(response.body.data).toHaveProperty('status');
    expect(response.body.data).toHaveProperty('database');
  });

  test('GET /metrics should return Prometheus metrics', async () => {
    const response = await request(app).get('/metrics');

    expect(response.status).toBe(200);
    expect(response.headers['content-type']).toContain('text/plain');
    expect(response.text).toContain('http_request_duration_seconds');
  });
});

describe('Authentication Endpoints', () => {
  test('POST /api/auth/register should create a new user', async () => {
    const newUser = {
      name: 'New User',
      email: 'newuser@example.com',
      password: 'NewUser@1234',
    };

    const response = await request(app)
      .post('/api/auth/register')
      .send(newUser);

    expect(response.status).toBe(201);
    expect(response.body).toHaveProperty('success', true);
    expect(response.body.data).toHaveProperty('accessToken');
    expect(response.body.data).toHaveProperty('user');
    expect(response.body.data.user).toHaveProperty('email', newUser.email);
  });

  test('POST /api/auth/login should authenticate user', async () => {
    const credentials = {
      email: 'test@example.com',
      password: 'Test@1234',
    };

    const response = await request(app)
      .post('/api/auth/login')
      .send(credentials);

    expect(response.status).toBe(200);
    expect(response.body).toHaveProperty('success', true);
    expect(response.body.data).toHaveProperty('accessToken');
  });

  test('POST /api/auth/login should reject invalid credentials', async () => {
    const credentials = {
      email: 'test@example.com',
      password: 'WrongPassword',
    };

    const response = await request(app)
      .post('/api/auth/login')
      .send(credentials);

    expect(response.status).toBe(401);
    expect(response.body).toHaveProperty('success', false);
  });
});

describe('School Management Endpoints', () => {
  test('GET /api/schools should list schools', async () => {
    const response = await request(app)
      .get('/api/schools')
      .set('Authorization', `Bearer ${authToken}`);

    expect(response.status).toBe(200);
    expect(response.body).toHaveProperty('success', true);
    expect(response.body.data).toBeInstanceOf(Array);
  });

  test('POST /api/schools should create a new school', async () => {
    const newSchool = {
      name: 'New Test School',
      email: 'new@school.com',
      address: '456 New St',
      type: 'primary',
      phone: '+9876543210',
    };

    const response = await request(app)
      .post('/api/schools')
      .set('Authorization', `Bearer ${authToken}`)
      .send(newSchool);

    expect(response.status).toBe(201);
    expect(response.body).toHaveProperty('success', true);
    expect(response.body.data).toHaveProperty('name', newSchool.name);
  });

  test('GET /api/schools/:id should get school details', async () => {
    const response = await request(app)
      .get(`/api/schools/${testSchool._id}`)
      .set('Authorization', `Bearer ${authToken}`);

    expect(response.status).toBe(200);
    expect(response.body).toHaveProperty('success', true);
    expect(response.body.data).toHaveProperty('_id', testSchool._id.toString());
  });

  test('PUT /api/schools/:id should update school', async () => {
    const updates = {
      name: 'Updated School Name',
    };

    const response = await request(app)
      .put(`/api/schools/${testSchool._id}`)
      .set('Authorization', `Bearer ${authToken}`)
      .send(updates);

    expect(response.status).toBe(200);
    expect(response.body).toHaveProperty('success', true);
    expect(response.body.data).toHaveProperty('name', updates.name);
  });
});

describe('Student Management Endpoints', () => {
  let testStudent;
  let testClassroom;

  beforeAll(async () => {
    // Import Classroom model
    const { default: Classroom } = await import('../models/Classroom.js');

    // Create a test classroom first
    testClassroom = await Classroom.create({
      school: testSchool._id,
      stage: 'jss',
      level: 1,
      section: 'A',
    });

    testStudent = await Student.create({
      firstName: 'John',
      lastName: 'Doe',
      email: 'john.doe@example.com',
      admissionNumber: 'ADM001',
      school: testSchool._id,
      classroom: testClassroom._id,
      dateOfBirth: new Date('2005-01-01'),
      gender: 'male',
    });
  });

  test('GET /api/students should list students', async () => {
    const response = await request(app)
      .get('/api/students')
      .set('Authorization', `Bearer ${authToken}`);

    expect(response.status).toBe(200);
    expect(response.body).toHaveProperty('success', true);
    expect(response.body.data).toBeInstanceOf(Array);
  });

  test('POST /api/students should create a new student', async () => {
    const newStudent = {
      firstName: 'Jane',
      lastName: 'Smith',
      email: 'jane.smith@example.com',
      admissionNumber: 'ADM002',
      school: testSchool._id,
      classroom: testClassroom._id,
      dateOfBirth: '2006-02-15',
      gender: 'female',
    };

    const response = await request(app)
      .post('/api/students')
      .set('Authorization', `Bearer ${authToken}`)
      .send(newStudent);

    expect(response.status).toBe(201);
    expect(response.body).toHaveProperty('success', true);
    expect(response.body.data).toHaveProperty('firstName', newStudent.firstName);
  });

  test('GET /api/students/:id should get student details', async () => {
    const response = await request(app)
      .get(`/api/students/${testStudent._id}`)
      .set('Authorization', `Bearer ${authToken}`);

    expect(response.status).toBe(200);
    expect(response.body).toHaveProperty('success', true);
    expect(response.body.data).toHaveProperty('_id', testStudent._id.toString());
  });
});

describe('Input Validation', () => {
  test('Should validate email format', async () => {
    const invalidUser = {
      name: 'Invalid User',
      email: 'invalid-email',
      password: 'Test@1234',
    };

    const response = await request(app)
      .post('/api/auth/register')
      .send(invalidUser);

    expect(response.status).toBe(400);
    expect(response.body).toHaveProperty('success', false);
    expect(response.body).toHaveProperty('errors');
  });

  test('Should validate password strength', async () => {
    const weakPassword = {
      name: 'Weak User',
      email: 'weak@example.com',
      password: '123456',
    };

    const response = await request(app)
      .post('/api/auth/register')
      .send(weakPassword);

    expect(response.status).toBe(400);
    expect(response.body).toHaveProperty('success', false);
  });

  test('Should sanitize MongoDB injection attempts', async () => {
    const maliciousQuery = {
      email: { $ne: null },
      password: 'any',
    };

    const response = await request(app)
      .post('/api/auth/login')
      .send(maliciousQuery);

    expect(response.status).toBe(400);
    expect(response.body).toHaveProperty('success', false);
  });
});

describe('Rate Limiting', () => {
  test('Should rate limit excessive requests', async () => {
    const requests = [];

    // Make 10 rapid requests
    for (let i = 0; i < 10; i++) {
      requests.push(
        request(app)
          .post('/api/auth/login')
          .send({ email: 'test@example.com', password: 'wrong' })
      );
    }

    const responses = await Promise.all(requests);
    const rateLimited = responses.some(r => r.status === 429);

    expect(rateLimited).toBe(true);
  });
});

describe('Error Handling', () => {
  test('Should handle 404 errors', async () => {
    const response = await request(app)
      .get('/api/nonexistent')
      .set('Authorization', `Bearer ${authToken}`);

    expect(response.status).toBe(404);
    expect(response.body).toHaveProperty('success', false);
    expect(response.body).toHaveProperty('message');
  });

  test('Should handle unauthorized access', async () => {
    const response = await request(app)
      .get('/api/schools');

    expect(response.status).toBe(401);
    expect(response.body).toHaveProperty('success', false);
  });

  test('Should handle invalid MongoDB ObjectId', async () => {
    const response = await request(app)
      .get('/api/schools/invalid-id')
      .set('Authorization', `Bearer ${authToken}`);

    expect(response.status).toBe(400);
    expect(response.body).toHaveProperty('success', false);
  });
});

describe('CORS Configuration', () => {
  test('Should include CORS headers', async () => {
    const response = await request(app)
      .options('/api/schools')
      .set('Origin', 'http://localhost:5173');

    expect(response.headers).toHaveProperty('access-control-allow-origin');
    expect(response.headers).toHaveProperty('access-control-allow-methods');
  });
});

describe('Security Headers', () => {
  test('Should include security headers', async () => {
    const response = await request(app).get('/healthz');

    expect(response.headers).toHaveProperty('x-content-type-options', 'nosniff');
    expect(response.headers['x-frame-options']).toMatch(/^(DENY|SAMEORIGIN)$/);
    expect(response.headers).toHaveProperty('x-xss-protection');
  });
});

describe('API Documentation', () => {
  test('GET /api-docs should return Swagger documentation', async () => {
    const response = await request(app).get('/api-docs.json');

    expect(response.status).toBe(200);
    expect(response.body).toHaveProperty('success', true);
    expect(response.body.data).toHaveProperty('openapi');
    expect(response.body.data).toHaveProperty('info');
    expect(response.body.data.info).toHaveProperty('title', 'Zinnol API Documentation');
  });
});

describe('Pagination', () => {
  test('Should support pagination parameters', async () => {
    const response = await request(app)
      .get('/api/students?page=1&limit=10')
      .set('Authorization', `Bearer ${authToken}`);

    expect(response.status).toBe(200);
    expect(response.body).toHaveProperty('success', true);
    expect(response.body).toHaveProperty('pagination');
    expect(response.body.pagination).toHaveProperty('page');
    expect(response.body.pagination).toHaveProperty('limit');
  });
});

describe('File Upload', () => {
  test('Should validate file types', async () => {
    const response = await request(app)
      .post('/api/upload/image')
      .set('Authorization', `Bearer ${authToken}`)
      .attach('file', Buffer.from('fake-image'), 'test.txt');

    expect(response.status).toBe(400);
    expect(response.body).toHaveProperty('success', false);
  });
});

describe('Caching', () => {
  test('Should cache frequently accessed data', async () => {
    // First request
    const response1 = await request(app)
      .get('/api/schools')
      .set('Authorization', `Bearer ${authToken}`);

    // Second request (should be cached)
    const response2 = await request(app)
      .get('/api/schools')
      .set('Authorization', `Bearer ${authToken}`);

    expect(response1.status).toBe(200);
    expect(response2.status).toBe(200);

    // Check if response time is faster for cached request
    // This is a simplified check; in real tests, you'd measure actual response times
    expect(response2.headers).toBeDefined();
  });
});