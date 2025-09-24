import { describe, it, expect, beforeEach, vi } from "vitest";
import router from "../../../routes/studentRoutes.js";

const toPaths = (r) => r.stack.filter((l) => l.route).map((l) => ({ path: l.route.path, methods: l.route.methods }));

describe("studentRoutes", () => {
    beforeEach(() => vi.clearAllMocks());

    it("declares expected endpoints and verbs", () => {
        const paths = toPaths(router);
        const assert = (path, verbs) => {
            const route = paths.find((p) => p.path === path);
            expect(route).toBeTruthy();
            expect(route?.methods).toMatchObject(verbs);
        };

        // Bulk endpoints
        assert("/bulk-import", { post: true });
        assert("/bulk-export-csv", { get: true });
        assert("/bulk-from-class-list-ocr", { post: true });

        // Root collection
        assert("/", { post: true, get: true });

        // By id
        assert("/:id", { get: true, put: true, delete: true });
    });
});
