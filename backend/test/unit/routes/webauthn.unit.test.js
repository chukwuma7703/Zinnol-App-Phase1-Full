import { describe, it, expect, beforeEach, vi } from "vitest";
import router from "../../../routes/webauthn.js";

const getPaths = (router) =>
    router.stack
        .filter((l) => l.route)
        .map((l) => ({ path: l.route.path, methods: l.route.methods }));

describe("webauthn routes", () => {
    beforeEach(() => vi.clearAllMocks());

    it("declares expected POST endpoints", () => {
        const paths = getPaths(router);
        const assert = (path, verbs) => {
            const r = paths.find((p) => p.path === path);
            expect(r).toBeTruthy();
            expect(r?.methods).toMatchObject(verbs);
        };

        assert("/register", { post: true });
        assert("/register/verify", { post: true });
        assert("/authenticate", { post: true });
        assert("/authenticate/verify", { post: true });
    });
});
