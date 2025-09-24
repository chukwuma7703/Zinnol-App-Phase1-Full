import { requireRole } from '../../../middleware/roleMiddleware.js';

describe('roleMiddleware', () => {
    const run = (allowed, user) => new Promise(resolve => {
        const req = { user };
        const res = { statusCode: 200, status(c) { this.statusCode = c; return this; }, json(p) { this.payload = p; resolve({ req, res }); } };
        const next = () => resolve({ req, res, nextCalled: true });
        requireRole(allowed)(req, res, next);
    });

    test('passes when role allowed', async () => {
        const { nextCalled } = await run(['ADMIN'], { role: 'ADMIN' });
        expect(nextCalled).toBe(true);
    });

    test('fails when role missing', async () => {
        const { res } = await run(['ADMIN'], { role: 'USER' });
        expect(res.statusCode).toBe(403);
        expect(res.payload.success).toBe(false);
    });

    test('fails when user absent', async () => {
        const { res } = await run(['ADMIN'], null);
        expect(res.statusCode).toBe(401);
    });
});
