import { vi, beforeEach, describe, it, expect } from 'vitest';
import router from '../../../routes/teacherRoutes.js';

describe('teacherRoutes', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('declares / (GET, POST) and /:id (GET, PUT, DELETE)', () => {
        // Mounting ensures the router module executes and registers routes (covers lines 11-22)
        // Inspect router stack for expected routes/methods
        const paths = router.stack
            .filter(l => l.route)
            .map(l => ({ path: l.route.path, methods: l.route.methods }));

        // Expect two route sets: '/' and '/:id'
        const root = paths.find(p => p.path === '/');
        const byId = paths.find(p => p.path === '/:id');
        expect(root).toBeTruthy();
        expect(byId).toBeTruthy();
        expect(root.methods).toMatchObject({ get: true, post: true });
        expect(byId.methods).toMatchObject({ get: true, put: true, delete: true });

    });
});
