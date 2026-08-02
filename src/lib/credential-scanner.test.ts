import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  formatScanResult,
  hasCredentialMatches,
  scanCredentials,
} from "../../scripts/scan-credentials.mjs";

const fixtures: string[] = [];
const fixture = () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "pouragenda-credentials-"));
  fixtures.push(root);
  fs.mkdirSync(path.join(root, "src"));
  return root;
};
const writeSource = (root: string, content: string) => fs.writeFileSync(path.join(root, "src", "fixture.txt"), content);
const supabaseKey = (kind: string) => ["sb", kind, "x".repeat(24)].join("_");
const jwt = (seed: string) => [`eyJ${seed.repeat(24)}`, `eyJ${seed.repeat(24)}`, seed.repeat(32)].join(".");

afterEach(() => {
  for (const root of fixtures.splice(0)) fs.rmSync(root, { recursive: true, force: true });
});

describe("credential scanner", () => {
  it.each([
    ["Supabase publishable key", () => supabaseKey("publishable"), "supabase-publishable-key"],
    ["Supabase secret key", () => supabaseKey("secret"), "supabase-secret-key"],
    ["legacy Supabase anon JWT", () => jwt("a"), "jwt-like-secret"],
    ["legacy Supabase service-role JWT", () => jwt("s"), "jwt-like-secret"],
    ["service-role assignment", () => `SUPABASE_${"SERVICE_ROLE_KEY"}=${"r".repeat(32)}`, "service-role-assignment"],
    ["postgres URL", () => `postgres${"://user:password@example.invalid/database"}`, "postgres-connection-url"],
    ["postgresql URL", () => `postgresql${"://user:password@example.invalid/database"}`, "postgres-connection-url"],
    ["database password assignment", () => `DATABASE_${"PASSWORD"}=${"p".repeat(24)}`, "database-password-assignment"],
    ["PEM private key", () => [`-----BEGIN ${["PRIVATE", "KEY-----"].join(" ")}`, "synthetic", `-----END ${["PRIVATE", "KEY-----"].join(" ")}`].join("\n"), "private-key"],
    ["JWT-like secret", () => jwt("j"), "jwt-like-secret"],
    ["bearer token assignment", () => `AUTHORIZATION=Bearer ${"b".repeat(32)}`, "bearer-token-assignment"],
    ["access token assignment", () => `ACCESS_${"TOKEN"}=${"t".repeat(32)}`, "access-token-assignment"],
  ])("rejects a synthetic %s", (_name, value, rule) => {
    const root = fixture();
    writeSource(root, value());

    const result = scanCredentials(root);

    expect(hasCredentialMatches(result)).toBe(true);
    expect(result.findings.some((item) => item.rule === rule)).toBe(true);
  });

  it("allows the tracked placeholder environment example", () => {
    const root = fixture();
    fs.copyFileSync(path.resolve(".env.example"), path.join(root, ".env.example"));

    expect(hasCredentialMatches(scanCredentials(root))).toBe(false);
  });

  it("allows placeholders in source fixtures", () => {
    const root = fixture();
    writeSource(root, [
      "NEXT_PUBLIC_SUPABASE_URL=https://YOUR_PROJECT_REF.supabase.co",
      "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=YOUR_SUPABASE_PUBLISHABLE_KEY",
      "DATABASE_PASSWORD=${DATABASE_PASSWORD}",
    ].join("\n"));

    expect(hasCredentialMatches(scanCredentials(root))).toBe(false);
  });

  it("allows local Supabase development endpoints", () => {
    const root = fixture();
    const localValues = ["localhost", "127.0.0.1", "http://127.0.0.1:54321", "http://localhost:54321/auth/v1"];
    fs.writeFileSync(path.join(root, ".env.local"), localValues.map((value, index) => `LOCAL_${index}=${value}`).join("\n"));
    writeSource(root, localValues.join("\n"));

    expect(hasCredentialMatches(scanCredentials(root))).toBe(false);
  });

  it("detects leaked ignored environment values without printing them", () => {
    const root = fixture();
    const privateValue = `private-${"value".repeat(8)}`;
    fs.writeFileSync(path.join(root, ".env.local"), `PRIVATE_TEST_VALUE=${privateValue}`);
    writeSource(root, `const leaked = "${privateValue}";`);

    const output = formatScanResult(scanCredentials(root));

    expect(output).toContain("local-environment-value");
    expect(output).toContain("<redacted>");
    expect(output).not.toContain(privateValue);
  });

  it("redacts directly matched credentials in scanner output", () => {
    const root = fixture();
    const privateValue = supabaseKey("secret");
    writeSource(root, privateValue);

    const output = formatScanResult(scanCredentials(root));

    expect(output).toContain("<redacted>");
    expect(output).not.toContain(privateValue);
  });

  it("detects credentials copied into generated artifacts", () => {
    const root = fixture();
    const privateValue = `artifact-${"value".repeat(8)}`;
    fs.writeFileSync(path.join(root, ".env.local"), `PRIVATE_TEST_VALUE=${privateValue}`);
    fs.mkdirSync(path.join(root, ".next"));
    fs.writeFileSync(path.join(root, ".next", "bundle.js"), privateValue);

    const result = scanCredentials(root);

    expect(result.artifact_test_credential_matches).toBe(1);
    expect(result.findings[0]?.value).toBe("<redacted>");
  });
});
