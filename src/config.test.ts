/**
 * Smoke / configuration tests for repo structure and secret hygiene.
 *
 * Feature: admin-org-dashboard
 * Requirements: 13.2, 13.3, 13.4, 14.1, 14.2
 *
 * These tests run in Node (not jsdom) so they can use `fs` and `path` to
 * inspect the repository layout and built artefacts directly.
 *
 * @vitest-environment node
 */

import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Absolute path to the repository root (two levels up from src/). */
const ROOT = path.resolve(__dirname, "..");

function rootPath(...segments: string[]): string {
  return path.join(ROOT, ...segments);
}

function exists(p: string): boolean {
  return fs.existsSync(p);
}

function readText(p: string): string {
  return fs.readFileSync(p, "utf-8");
}

// ---------------------------------------------------------------------------
// 14.1 – Repository structure
// ---------------------------------------------------------------------------

describe("Repository structure (Requirement 14.1)", () => {
  it("src/ directory exists", () => {
    expect(exists(rootPath("src"))).toBe(true);
  });

  it("supabase/functions/ directory exists", () => {
    expect(exists(rootPath("supabase", "functions"))).toBe(true);
  });

  it("supabase/migrations/ directory exists", () => {
    expect(exists(rootPath("supabase", "migrations"))).toBe(true);
  });

  it("root config files exist (package.json, vite.config.ts, tsconfig.json)", () => {
    expect(exists(rootPath("package.json"))).toBe(true);
    expect(exists(rootPath("vite.config.ts"))).toBe(true);
    expect(exists(rootPath("tsconfig.json"))).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// 14.2 – Required root files
// ---------------------------------------------------------------------------

describe("Required root files (Requirement 14.2)", () => {
  it("README.md is present at the repository root", () => {
    expect(exists(rootPath("README.md"))).toBe(true);
  });

  it(".env.example is present at the repository root", () => {
    expect(exists(rootPath(".env.example"))).toBe(true);
  });

  it(".gitignore is present at the repository root", () => {
    expect(exists(rootPath(".gitignore"))).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// 13.3 – .gitignore excludes .env* files (except .env.example)
// ---------------------------------------------------------------------------

describe(".gitignore secret exclusion (Requirement 13.3)", () => {
  it("excludes .env files via a .env* pattern", () => {
    const gitignore = readText(rootPath(".gitignore"));
    // Must contain a pattern that matches .env and .env.local etc.
    // Acceptable forms: ".env", ".env.*", ".env*"
    expect(gitignore).toMatch(/^\.env(\.\*|\*)?$/m);
  });

  it("does NOT un-negate .env (i.e. .env itself is not whitelisted)", () => {
    const gitignore = readText(rootPath(".gitignore"));
    // The only negation allowed is !.env.example
    const negations = gitignore
      .split("\n")
      .map((l) => l.trim())
      .filter((l) => l.startsWith("!") && l.includes(".env"));
    // Every negation must be exactly !.env.example
    for (const neg of negations) {
      expect(neg).toBe("!.env.example");
    }
  });

  it("excludes node_modules/", () => {
    const gitignore = readText(rootPath(".gitignore"));
    expect(gitignore).toMatch(/^node_modules\/?$/m);
  });

  it("excludes dist/", () => {
    const gitignore = readText(rootPath(".gitignore"));
    expect(gitignore).toMatch(/^dist\/?$/m);
  });
});

// ---------------------------------------------------------------------------
// 13.2 – .env.example contains no secret values
// ---------------------------------------------------------------------------

/**
 * A "secret value" is defined as a non-empty assignment on the right-hand
 * side of an `=` in a non-comment line.  Placeholder text like empty strings
 * or angle-bracket tokens (<value>) are acceptable.
 */
describe(".env.example secret hygiene (Requirement 13.2)", () => {
  it(".env.example exists and is readable", () => {
    expect(exists(rootPath(".env.example"))).toBe(true);
  });

  it("every variable assignment in .env.example has an empty or placeholder value", () => {
    const content = readText(rootPath(".env.example"));
    const lines = content.split("\n");

    for (const raw of lines) {
      const line = raw.trim();
      // Skip blank lines and comments
      if (!line || line.startsWith("#")) continue;

      // Must be a KEY=VALUE line
      const eqIdx = line.indexOf("=");
      if (eqIdx === -1) continue; // not an assignment – skip

      const value = line.slice(eqIdx + 1).trim();

      // Acceptable values: empty, or a placeholder like <...> or YOUR_... or
      // a URL-shaped placeholder without an actual key embedded.
      // Reject anything that looks like a real Supabase key (long base64/JWT).
      const looksLikeSecret =
        // Supabase anon/service keys are long JWT strings (>40 chars, no spaces)
        value.length > 40 && !/\s/.test(value) && !value.startsWith("<");

      expect(
        looksLikeSecret,
        `Line "${line}" appears to contain a real secret value`
      ).toBe(false);
    }
  });

  it(".env.example does not contain the string 'service_role'", () => {
    const content = readText(rootPath(".env.example"));
    expect(content).not.toContain("service_role");
  });

  it(".env.example does not contain SUPABASE_SERVICE_ROLE_KEY", () => {
    const content = readText(rootPath(".env.example"));
    expect(content).not.toContain("SUPABASE_SERVICE_ROLE_KEY");
  });
});

// ---------------------------------------------------------------------------
// 13.4 – Built client bundle is free of the service-role key
// ---------------------------------------------------------------------------

describe("Client bundle secret hygiene (Requirement 13.4)", () => {
  const assetsDir = rootPath("dist", "assets");

  it("dist/assets/ directory exists (run `npm run build` first if missing)", () => {
    expect(exists(assetsDir)).toBe(true);
  });

  it("no JS bundle in dist/assets/ contains the string 'service_role'", () => {
    const files = fs
      .readdirSync(assetsDir)
      .filter((f) => f.endsWith(".js"))
      .map((f) => path.join(assetsDir, f));

    expect(files.length).toBeGreaterThan(0);

    for (const file of files) {
      const content = readText(file);
      expect(
        content,
        `Bundle ${path.basename(file)} contains 'service_role'`
      ).not.toContain("service_role");
    }
  });

  it("no JS bundle in dist/assets/ contains 'SUPABASE_SERVICE_ROLE_KEY'", () => {
    const files = fs
      .readdirSync(assetsDir)
      .filter((f) => f.endsWith(".js"))
      .map((f) => path.join(assetsDir, f));

    for (const file of files) {
      const content = readText(file);
      expect(
        content,
        `Bundle ${path.basename(file)} contains 'SUPABASE_SERVICE_ROLE_KEY'`
      ).not.toContain("SUPABASE_SERVICE_ROLE_KEY");
    }
  });
});
