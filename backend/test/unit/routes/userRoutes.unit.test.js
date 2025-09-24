import { describe, it, expect, beforeEach, vi } from "vitest";
import router from "../../../routes/userRoutes.js";

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

describe("userRoutes", () => {
    beforeEach(() => vi.clearAllMocks());

    it("declares expected auth/profile/admin endpoints", () => {
        const paths = toMergedPaths(router);
        const assert = (path, verbs) => {
            const route = paths.find((p) => p.path === path);
            expect(route).toBeTruthy();
            expect(route?.methods).toMatchObject(verbs);
        };

        // auth flows
        assert("/register", { post: true });
        assert("/login", { post: true });
        assert("/login/verify-mfa", { post: true });
        assert("/google-login", { post: true });
        assert("/logout", { post: true });
        assert("/refresh", { post: true });
        assert("/forgot-password", { post: true });
        assert("/reset-password/:token", { put: true });

        // mfa
        assert("/mfa/setup", { post: true });
        assert("/mfa/verify", { post: true });
        assert("/mfa/disable", { post: true });
        assert("/mfa/regenerate-recovery", { post: true });

        // me/profile/dashboard
        assert("/me", { get: true });
        assert("/profile", { get: true, put: true });
        assert("/dashboard", { get: true });

        // admin users
        assert("/", { post: true, get: true });
        assert("/:id", { get: true, delete: true });
        assert("/:id/role", { put: true });
        assert("/:id/status", { put: true });
        assert("/:id/reset-password", { put: true });
    });
});
