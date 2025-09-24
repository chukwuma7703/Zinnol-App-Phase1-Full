#!/usr/bin/env node
/*
 * analyze-open-handles.js
 * Heuristically parses a Jest --detectOpenHandles log and emits a concise JSON + text summary.
 * Non-zero exit only if explicit leak patterns exceed thresholds (configurable below) once gating is desired.
 */
import fs from 'fs';
import path from 'path';

const LOG_PATH = process.env.OPEN_HANDLES_LOG || path.join(process.cwd(), 'open-handles.log');

if (!fs.existsSync(LOG_PATH)) {
    console.error(`[analyze-open-handles] Log file not found: ${LOG_PATH}`);
    process.exit(0); // non-fatal
}

const raw = fs.readFileSync(LOG_PATH, 'utf8');

// Patterns to detect (add more as needed)
const patterns = [
    { key: 'mongodb', regex: /(Mongo|Mongoose).*open/i, label: 'Possible unclosed Mongo connection' },
    { key: 'redis', regex: /Redis|ioredis|ECONNREFUSED.*6379/i, label: 'Possible unclosed Redis connection' },
    { key: 'server', regex: /Server is running|EADDRINUSE|server\.listen/i, label: 'HTTP server listener not closed' },
    { key: 'timer', regex: /setTimeout|setInterval/i, label: 'Outstanding timer' },
    { key: 'promise', regex: /unhandledRejection|UnhandledPromiseRejection/i, label: 'Unhandled promise rejection' },
];

const summary = {};
patterns.forEach(p => { summary[p.key] = { count: 0, label: p.label, samples: [] }; });

const lines = raw.split(/\r?\n/);
lines.forEach(line => {
    patterns.forEach(p => {
        if (p.regex.test(line)) {
            const bucket = summary[p.key];
            if (bucket.samples.length < 5) bucket.samples.push(line.trim());
            bucket.count++;
        }
    });
});

const condensed = Object.fromEntries(Object.entries(summary).map(([k, v]) => [k, { count: v.count, label: v.label, samples: v.samples }]));

const totalHits = Object.values(condensed).reduce((a, v) => a + v.count, 0);

const result = {
    analyzedAt: new Date().toISOString(),
    logFile: LOG_PATH,
    totalLines: lines.length,
    totalHits,
    buckets: condensed,
};

const outJson = path.join(process.cwd(), 'open-handles-summary.json');
const outTxt = path.join(process.cwd(), 'open-handles-summary.txt');

fs.writeFileSync(outJson, JSON.stringify(result, null, 2));

let txt = `Open Handles Analysis (heuristic)\nGenerated: ${result.analyzedAt}\nTotal lines: ${result.totalLines}\nTotal pattern hits: ${totalHits}\n`;
for (const [k, v] of Object.entries(result.buckets)) {
    txt += `\n[${k}] ${v.label}\n  Count: ${v.count}\n`;
    v.samples.forEach(s => { txt += `    - ${s}\n`; });
}
fs.writeFileSync(outTxt, txt);

console.log('[analyze-open-handles] Summary written to:', outJson, 'and', outTxt);
console.log(txt);

// Currently non-fatal; adjust gating logic here if desired.
process.exit(0);
