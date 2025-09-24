// Simulate how .env would store your key
const envValue = "-----BEGIN PRIVATE KEY-----\\nABC123\\nXYZ456\\n-----END PRIVATE KEY-----\\n";

console.log("=== Raw value from .env ===");
console.log(envValue); // Shows literal \n, no real line breaks

// Replace literal \n (backslash + n) with real newlines
const fixedValue = envValue.replace(/\\n/g, '\n');

console.log("\n=== After replace(/\\\\n/g, '\\n') ===");
console.log(fixedValue); // Shows proper PEM format with real line breaks

console.log("\n=== Let's visualize character codes ===");
for (const ch of fixedValue) {
  process.stdout.write(`${ch === '\n' ? '\\n' : ch} `);
}
// This shows where actual newline characters occur
