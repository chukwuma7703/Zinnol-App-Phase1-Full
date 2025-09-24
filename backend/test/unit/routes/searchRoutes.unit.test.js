import { describe, it, expect, beforeEach, vi } from "vitest";
import router from "../../../routes/searchRoutes.js";

describe("searchRoutes", () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it("declares '/' GET route", () => {
        const paths = router.stack
            .filter((l) => l.route)
            .map((l) => ({ path: l.route.path, methods: l.route.methods }));

        const root = paths.find((p) => p.path === "/");
        expect(root).toBeTruthy();
        expect(root?.methods).toMatchObject({ get: true });
    });
});
