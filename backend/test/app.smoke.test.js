import request from 'supertest';
import app from '../app.js';

describe('App smoke tests', () => {
  it('GET / should return API status', async () => {
    const res = await request(app).get('/');
    expect(res.statusCode).toBe(200);
    expect(res.body).toHaveProperty('message', 'Zinnol API Server');
  });

  it('GET /healthz should be healthy', async () => {
    const res = await request(app).get('/healthz');
    expect(res.statusCode).toBe(200);
    expect(res.body).toHaveProperty('status');
  });

  it('GET /api should return running message', async () => {
    const res = await request(app).get('/api');
    expect(res.statusCode).toBe(200);
    expect(res.body).toHaveProperty('message');
  });
});
