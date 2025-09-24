#!/usr/bin/env node
import { performance } from 'perf_hooks';
import jwt from 'jsonwebtoken';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

// Attempt to load env (adjust if project uses different path)
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.resolve(__dirname, '../zinnol.env') });

// Simple token generation reps using existing secret or fallback
const ACCESS_SECRET = process.env.JWT_SECRET || 'dev-secret';

function generateAccessToken(payload) {
    return jwt.sign(payload, ACCESS_SECRET, { expiresIn: '15m' });
}

const ITERATIONS = parseInt(process.argv[2] || '5000', 10);
const payload = { uid: 'test-user', role: 'tester' };

const start = performance.now();
for (let i = 0; i < ITERATIONS; i++) {
    generateAccessToken(payload);
}
const end = performance.now();

const totalMs = end - start;
const perSec = (ITERATIONS / (totalMs / 1000)).toFixed(0);

console.log(`Token generation benchmark`);
console.log(`Iterations: ${ITERATIONS}`);
console.log(`Total time: ${totalMs.toFixed(2)} ms`);
console.log(`Throughput: ${perSec} tokens/sec`);
