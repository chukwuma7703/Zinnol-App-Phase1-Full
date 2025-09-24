import { describe, it, expect, beforeEach, vi } from "vitest";
import router from "../../../routes/teacherActivityRoutes.js";

function toPaths(router) {
    return router.stack
        .filter((l) => l.route)
        .map((l) => ({ path: l.route.path, methods: l.route.methods }));
}

describe("teacherActivityRoutes", () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it("declares expected paths and verbs", () => {
        const paths = toPaths(router);
        const assert = (path, verbs) => {
            const r = paths.find((p) => p.path === path);
            expect(r).toBeTruthy();
            expect(r?.methods).toMatchObject(verbs);
        };

        assert("/start", { post: true });
        assert("/:id/end", { patch: true });
        assert("/:id/coaching", { get: true });
        assert("/coaching-history", { get: true });
        assert("/stats", { get: true });
        assert("/school-coaching-analytics", { get: true });
        assert("/:id/request-coaching", { post: true });
        assert("/:id/rate-coaching", { post: true });
        assert("/best-practices", { get: true });
        assert("/needs-support", { get: true });
    });
});
