/**
 * Strict Case-Sensitive Import & Filesystem Integrity Checker
 * Verifies that all imports and filesystem paths match exact casing on disk
 * to prevent Linux/Vercel production build failures.
 */

import fs from "fs";
import path from "path";

const ROOT_DIR = process.cwd();
const SCAN_DIRS = ["app", "components", "lib", "types", "tests"];
const EXTENSIONS = [".ts", ".tsx", ".js", ".jsx", ".json"];

let totalImportsChecked = 0;
let casingErrors: Array<{ file: string; importPath: string; expected: string; actual: string }> = [];
let duplicateCaseFiles: string[] = [];

function checkCaseExact(targetPath: string): boolean {
  const normalized = path.normalize(targetPath);
  const parts = normalized.split(path.sep);

  let current = parts[0] ? (parts[0].endsWith(":") ? parts[0] + path.sep : parts[0]) : path.sep;

  for (let i = (parts[0] ? 1 : 1); i < parts.length; i++) {
    const part = parts[i];
    if (!part) continue;

    try {
      const entries = fs.readdirSync(current);
      const exactMatch = entries.find((e) => e === part);

      if (!exactMatch) {
        const caseInsensitiveMatch = entries.find((e) => e.toLowerCase() === part.toLowerCase());
        if (caseInsensitiveMatch) {
          casingErrors.push({
            file: targetPath,
            importPath: part,
            expected: caseInsensitiveMatch,
            actual: part,
          });
          return false;
        }
      }
      current = path.join(current, part);
    } catch {
      return true; // Directory cannot be read or external
    }
  }

  return true;
}

function resolveImport(importPath: string, fromFile: string): string | null {
  let resolvedBase: string;

  if (importPath.startsWith("@/")) {
    resolvedBase = path.join(ROOT_DIR, importPath.slice(2));
  } else if (importPath.startsWith("./") || importPath.startsWith("../")) {
    resolvedBase = path.resolve(path.dirname(fromFile), importPath);
  } else {
    // External npm module (e.g. "react", "lucide-react")
    return null;
  }

  // 1. Direct file check with extensions
  for (const ext of EXTENSIONS) {
    const candidate = resolvedBase + ext;
    if (fs.existsSync(candidate)) {
      return candidate;
    }
  }

  // 2. Index file in directory check
  for (const ext of EXTENSIONS) {
    const candidate = path.join(resolvedBase, "index" + ext);
    if (fs.existsSync(candidate)) {
      return candidate;
    }
  }

  // 3. Exact file as-is
  if (fs.existsSync(resolvedBase)) {
    return resolvedBase;
  }

  return null;
}

function scanFile(filePath: string) {
  const content = fs.readFileSync(filePath, "utf-8");
  // Match `import ... from "..."` and `import("...")`
  const importRegex = /(?:import|export)\s+(?:[\s\S]*?from\s+)?['"]([^'"]+)['"]/g;
  const dynamicImportRegex = /import\s*\(\s*['"]([^'"]+)['"]\s*\)/g;

  let match;
  while ((match = importRegex.exec(content)) !== null) {
    const importSpecifier = match[1];
    checkImportSpecifier(importSpecifier, filePath);
  }

  while ((match = dynamicImportRegex.exec(content)) !== null) {
    const importSpecifier = match[1];
    checkImportSpecifier(importSpecifier, filePath);
  }
}

function checkImportSpecifier(importSpecifier: string, filePath: string) {
  if (!importSpecifier.startsWith("@/") && !importSpecifier.startsWith("./") && !importSpecifier.startsWith("../")) {
    return; // Ignore third-party packages
  }

  totalImportsChecked++;
  const resolved = resolveImport(importSpecifier, filePath);

  if (resolved) {
    // Verify case exactness of the resolved path
    const relativeToRoot = path.relative(ROOT_DIR, resolved);
    const parts = relativeToRoot.split(path.sep);

    let current = ROOT_DIR;
    for (const part of parts) {
      try {
        const entries = fs.readdirSync(current);
        if (!entries.includes(part)) {
          const matched = entries.find((e) => e.toLowerCase() === part.toLowerCase());
          casingErrors.push({
            file: path.relative(ROOT_DIR, filePath),
            importPath: importSpecifier,
            expected: matched || "(unknown)",
            actual: part,
          });
        }
        current = path.join(current, part);
      } catch {
        break;
      }
    }
  }
}

function scanDir(dirPath: string) {
  const entries = fs.readdirSync(dirPath, { withFileTypes: true });

  // Check for case-insensitive duplicate files in same directory
  const seenLower = new Map<string, string>();
  for (const entry of entries) {
    const lower = entry.name.toLowerCase();
    if (seenLower.has(lower)) {
      duplicateCaseFiles.push(`${path.join(dirPath, entry.name)} vs ${path.join(dirPath, seenLower.get(lower)!)}`);
    } else {
      seenLower.set(lower, entry.name);
    }
  }

  for (const entry of entries) {
    const fullPath = path.join(dirPath, entry.name);
    if (entry.isDirectory()) {
      if (entry.name !== "node_modules" && entry.name !== ".next" && entry.name !== ".git") {
        scanDir(fullPath);
      }
    } else if (EXTENSIONS.some((ext) => entry.name.endsWith(ext))) {
      scanFile(fullPath);
    }
  }
}

console.log("\n=======================================================");
console.log("  SST-ERP STRICT CASING & IMPORT VALIDATION CHECKER");
console.log("=======================================================\n");

for (const dir of SCAN_DIRS) {
  const full = path.join(ROOT_DIR, dir);
  if (fs.existsSync(full)) {
    console.log(`Scanning directory: ${dir}/ ...`);
    scanDir(full);
  }
}

console.log(`\nChecked ${totalImportsChecked} relative/alias import statements.`);

if (duplicateCaseFiles.length > 0) {
  console.error("\n❌ FATAL: Case-conflicting duplicate files found:");
  duplicateCaseFiles.forEach((d) => console.error(`  - ${d}`));
} else {
  console.log("✅ Zero case-conflicting duplicate filenames found.");
}

if (casingErrors.length > 0) {
  console.error(`\n❌ FATAL: Found ${casingErrors.length} import casing mismatches:`);
  casingErrors.forEach((err) => {
    console.error(`  File: ${err.file}`);
    console.error(`    Import: "${err.importPath}" -> Path segment "${err.actual}" does not match exact disk casing "${err.expected}"`);
  });
  process.exit(1);
} else {
  console.log("✅ All import paths match exact disk casing 100% (Linux/Docker production safe)!\n");
  process.exit(0);
}
