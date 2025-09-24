import request from 'supertest';
import app from '../app.js';

describe('Public routes', () => {
  it('GET /api should work (sanity)', async () => {
    const res = await request(app).get('/api');
    expect(res.statusCode).toBe(200);
  });

  it('GET /non-existent should return 404 JSON', async () => {
    const res = await request(app).get('/no-such-route');
    expect(res.statusCode).toBe(404);
    expect(res.body).toHaveProperty('success', false);
  });
});
