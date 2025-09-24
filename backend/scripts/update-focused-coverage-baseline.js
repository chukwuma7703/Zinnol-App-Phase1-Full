#!/usr/bin/env node
/**
 * Updates scripts/coverage-baseline.focused.json from coverage/coverage-summary.json
 * Use after a green focused coverage run when you intentionally raise coverage.
 */
import fs from 'fs';
import path from 'path';

const ROOT = process.cwd();
const summaryPath = path.join(ROOT, 'coverage', 'coverage-summary.json');
const baselinePath = path.join(ROOT, 'scripts', 'coverage-baseline.focused.json');

function round2(n) { return Math.round(n * 100) / 100; }

if (!fs.existsSync(summaryPath)) {
    console.error(`[baseline:update] Missing ${summaryPath}. Run coverage first.`);
    process.exit(1);
}

const summary = JSON.parse(fs.readFileSync(summaryPath, 'utf8'));
const total = summary.total || summary;

const next = {
    statements: round2(total.statements?.pct ?? 0),
    branches: round2(total.branches?.pct ?? 0),
    functions: round2(total.functions?.pct ?? 0),
    lines: round2(total.lines?.pct ?? 0)
};

fs.writeFileSync(baselinePath, JSON.stringify(next, null, 4) + '\n');
console.log('[baseline:update] Wrote new baseline to', baselinePath);
console.table(next);
