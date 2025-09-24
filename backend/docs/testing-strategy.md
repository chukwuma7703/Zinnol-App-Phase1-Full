# Testing Strategy

## Overview
Two-lane approach for fast feedback and deep coverage:
- **Smoke Lane (jest.smoke.config.js)**: <5s, strict coverage on critical surface (routes + lightweight middleware/utils). Heavy side-effects replaced by controller/middleware doubles via moduleNameMapper. Excludes deep authz unit tests that rely on real logic.
- **Default Lane (jest.config.js)**: Broader unit + selective integration. In-memory MongoDB (mongodb-memory-server) started in `test/globalSetup.cjs`. Real middleware logic executed.

## Recent Progress (Feb 2025)
- Adopted `ApiResponse` in `classController` and `assignmentController` with dedicated unit tests verifying envelope shape.
- Added service unit tests for `notificationService` covering: token pruning, no-token early exit, database error path.
- Introduced performance benchmark script `scripts/bench-tokens.js` (baseline ~1000 tokens/sec on local run: 2k iterations ≈ 1.99s).
- Established pattern for future controller migrations (create/list/update/delete → `ok`/`created`).

## Goals
1. Deterministic, sub-5s smoke signal with 98%+ lines/statements and stable branch coverage.
2. Incremental expansion of high-yield unit tests (middleware, utils, services) without slowing smoke.
3. Isolation from real external services (DB, Redis, Cron, Sockets, Google APIs) through targeted mocks.
4. Consistent API response envelope across migrated controllers.

## Key Patterns
- **Module Isolation**: Use `jest.isolateModules` or `jest.unstable_mockModule` to inject mocks before importing code under test.
- **Side-Effect Mocks** (Smoke): Socket, monitoring, cron, swagger, bullmq, logger replaced globally.
- **Middleware / Controller Doubles** (Smoke): Kept in `test/mocks` and mapped only in `jest.smoke.config.js`.
- **Auth & Authorization**: Deep tests live in `test/unit/middleware/*.unit.test.js`; they are ignored by smoke to avoid mock collisions.
- **Response Helpers**: `utils/ApiResponse.js` tested in isolation; adoption into controllers asserts consistent shape.

## Adding New Tests
1. Decide lane:
   - Route shape / basic 200/4xx + wiring → Smoke.
   - Branch / error path / data permutations → Default.
2. For smoke route additions:
   - Add test under `test/route-smoke`.
   - If a new heavy controller is needed, create a mock in `test/mocks` and add mapper.
3. For deep unit tests:
   - Place under `test/unit/<domain>`; avoid importing entire server.
   - Mock only direct model/service dependencies.

## Coverage Focus Areas (Next)
- Additional controllers (assignment grading edge cases, subject, timetable) migration to ApiResponse.
- Remaining branch gaps in request tracking & validation middleware.
- Wider service coverage (analytics, token utilities, queue job processors).

## Do / Avoid
| Do | Avoid |
|----|-------|
| Keep smoke deterministic, no real DB | Adding network or DB calls into smoke |
| Mock side-effects once globally | Re-mocking globals per test file unnecessarily |
| Assert explicit error messages & status codes | Only checking status without message |
| Table-driven edge cases for pure utils/services | Over-integrating (booting server) for simple functions |

## Example Decision Matrix
| Feature | Test Type | Lane |
|---------|-----------|------|
| New route HTTP 200 | Route smoke | Smoke |
| Authorization branch (403) | Middleware unit | Default |
| Data validation permutations | Validation unit | Default |
| Performance regression guard | Benchmark/manual | N/A |

## Optimization Metrics (Current)
- **Smoke Lane**: <4s execution, 100% lines/statements/functions, ~97.22% branches
- **Token Benchmark**: ~1000 tokens/sec (local baseline) — monitor for ±15% regression

## Next Steps (Revised Order)
1. Continue controller ApiResponse adoption (subjects, timetable, notifications endpoints).
2. Expand service tests (analytics, queue workers) for branch coverage uplift to >98%.
3. Add benchmark harness variants (JWT verify, bcrypt hash if applicable) gated outside default test runs.
4. Target remaining branch gaps (request tracking edge flags, late submission classification logic once implemented).

## Branch Coverage Improvement Tactics
- Identify untested conditional paths via jest --coverage output.
- Write minimal unit tests focusing only on the missing branch (avoid broad integration).
- Prefer synthetic model mocks returning crafted states to force branch selection.

## Maintenance
- Gate heavy integration suites behind explicit npm scripts to preserve fast feedback.
- Periodically re-baseline benchmarks after major dependency upgrades.
- Keep ApiResponse adoption list updated until 100% of externally facing controllers migrated.
- Avoid raising coverage thresholds until 5 consecutive green runs confirm stability.

---
Document owner: Testing maintainers
Last updated: 2025-02-16
