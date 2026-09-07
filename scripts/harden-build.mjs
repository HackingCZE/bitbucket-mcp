#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const distDir = path.join(rootDir, "dist");
const legacyEntry = path.join(distDir, "index.js");
const hardenedEntry = path.join(distDir, "hardened-proxy.js");
const coreEntry = path.join(distDir, "core.js");

if (!fs.existsSync(legacyEntry)) {
  throw new Error(`Expected TypeScript output not found: ${legacyEntry}`);
}
if (!fs.existsSync(hardenedEntry)) {
  throw new Error(`Expected hardened proxy output not found: ${hardenedEntry}`);
}

fs.rmSync(coreEntry, { force: true });
fs.renameSync(legacyEntry, coreEntry);
fs.renameSync(hardenedEntry, legacyEntry);

if (process.platform !== "win32") {
  fs.chmodSync(legacyEntry, 0o755);
  fs.chmodSync(coreEntry, 0o755);
}

console.log("Hardened build complete: dist/index.js -> read-only proxy, dist/core.js -> Bitbucket core");
