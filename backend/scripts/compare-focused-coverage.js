#!/usr/bin/env node
/**
 * Compares current focused unit coverage (coverage/coverage-summary.json)
 * against baseline (scripts/coverage-baseline.focused.json).
 * Fails (exit 2) if any metric regresses more than the allowed tolerance.
 * Tolerance (percentage points) is configured via COVERAGE_TOLERANCE env var (default 0.15).
 */

import fs from 'fs';
import path from 'path';
import process from 'process';

const ROOT = path.resolve(process.cwd());
const summaryPath = path.join(ROOT, 'coverage', 'coverage-summary.json');
const baselinePath = path.join(ROOT, 'scripts', 'coverage-baseline.focused.json');

const tolerancePct = parseFloat(process.env.COVERAGE_TOLERANCE || '0.15'); // allow tiny noise (0.15%)

function readJSON(p) {
    if (!fs.existsSync(p)) {
        console.error(`Missing file: ${p}`);
        process.exit(1);
    }
    return JSON.parse(fs.readFileSync(p, 'utf8'));
}

try {
    const summary = readJSON(summaryPath);
    const baseline = readJSON(baselinePath);

    // Jest summary has total metrics under 'total'
    const total = summary.total || summary;

    const metrics = [
        ['statements', 'statements'],
        ['branches', 'branches'],
        ['functions', 'functions'],
        ['lines', 'lines']
    ];

    let failed = false;
    const reportLines = [];
    reportLines.push(`Coverage regression check (tolerance ±${tolerancePct}%)`);

    for (const [key, label] of metrics) {
        const currentPct = total[key]?.pct;
        const baselinePct = baseline[label];
        if (typeof currentPct !== 'number' || typeof baselinePct !== 'number') {
            console.warn(`Skipping metric ${label} (missing data)`);
            continue;
        }
        const diff = currentPct - baselinePct;
        const status = diff + tolerancePct < 0 ? 'REGRESSION' : 'OK';
        if (status === 'REGRESSION') failed = true;
        reportLines.push(`${label.padEnd(10)} baseline=${baselinePct.toFixed(2)} current=${currentPct.toFixed(2)} diff=${diff.toFixed(2)} => ${status}`);
    }

    const report = reportLines.join('\n');
    console.log(report);

    if (failed) {
        console.error('\n❌ Coverage regression detected beyond tolerance.');
        process.exit(2);
    } else {
        console.log('\n✅ Coverage stable (no significant regressions).');
    }
} catch (err) {
    console.error('Error comparing coverage:', err);
    process.exit(1);
}
