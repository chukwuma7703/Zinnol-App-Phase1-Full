import { describe, it, expect, beforeEach, vi } from "vitest";
import router from "../../../routes/schoolRoutes.js";

// Merge methods for identical paths that may be registered across multiple chains
const toMergedPaths = (r) => {
    const entries = r.stack
        .filter((l) => l.route)
        .map((l) => ({ path: l.route.path, methods: l.route.methods }));
    const map = new Map();
    for (const e of entries) {
        const existing = map.get(e.path) || {};
        map.set(e.path, { path: e.path, methods: { ...existing.methods, ...e.methods } });
    }
    return Array.from(map.values());
};

describe("schoolRoutes", () => {
    beforeEach(() => vi.clearAllMocks());

    it("declares expected school management, roles, students, and grading endpoints", () => {
        const paths = toMergedPaths(router);
        const assert = (path, verbs) => {
            const route = paths.find((p) => p.path === path);
            expect(route).toBeTruthy();
            expect(route?.methods).toMatchObject(verbs);
        };

        // public locations listing
        assert("/locations", { get: true });

        // root create/list
        assert("/", { post: true, get: true });

        // main super admin assign/remove
        assert("/:id/assign-main-super-admin", { post: true });
        assert("/:id/remove-main-super-admin", { delete: true });

        // role assignments
        assert("/:id/assign-super-admin", { post: true });
        assert("/:id/assign-principal", { post: true });
        assert("/:id/assign-teacher", { post: true });
        assert("/:id/assign-parent", { post: true });
        assert("/:id/assign-student", { post: true });

        // school by id CRUD
        assert("/:id", { get: true, put: true, delete: true });

        // student management
        assert("/:id/students", { post: true });
        assert("/:id/students/:studentId", { put: true, delete: true });

        // grading system (per-school)
        assert("/:id/grading-system", { get: true, put: true });
        assert("/:id/grade-distribution", { get: true });

        // global grading systems
        assert("/grading-systems", { get: true });
        assert("/grading-systems/validate", { post: true });
        assert("/grading-systems/preview", { post: true });
    });
});
