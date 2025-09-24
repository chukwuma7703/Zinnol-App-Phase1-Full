import fs from "fs";
import path from "path";

// Simple search utility: searches for query in code, docs, and data files
export async function searchCodebase(query) {
    const rootDir = path.resolve(process.cwd());
    const results = [];
    const exts = [".js", ".jsx", ".md", ".json"];

    function searchFile(filePath) {
        const content = fs.readFileSync(filePath, "utf8");
        if (content.toLowerCase().includes(query.toLowerCase())) {
            results.push({ file: filePath, snippet: extractSnippet(content, query) });
        }
    }

    function extractSnippet(content, query) {
        const idx = content.toLowerCase().indexOf(query.toLowerCase());
        if (idx === -1) return "...";
        const start = Math.max(0, idx - 40);
        const end = Math.min(content.length, idx + query.length + 40);
        return content.substring(start, end);
    }

    function walk(dir) {
        for (const entry of fs.readdirSync(dir)) {
            const fullPath = path.join(dir, entry);
            if (fs.statSync(fullPath).isDirectory()) {
                walk(fullPath);
            } else if (exts.some(ext => entry.endsWith(ext))) {
                searchFile(fullPath);
            }
        }
    }

    walk(rootDir);
    return results;
}
