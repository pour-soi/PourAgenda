import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const sourceIgnored = new Set([
  ".git", ".next", ".open-next", ".temp", ".wrangler", "node_modules",
  "playwright-report", "test-results",
]);
const artifactRoots = [".next", ".open-next", "playwright-report", "test-results"];
const redactedValue = "<redacted>";

const patternRules = [
  { id: "supabase-publishable-key", pattern: /\bsb_publishable_[a-z0-9_-]{16,}\b/gi },
  { id: "supabase-secret-key", pattern: /\bsb_secret_[a-z0-9_-]{16,}\b/gi },
  { id: "jwt-like-secret", pattern: /\beyJ[a-zA-Z0-9_-]{20,}\.eyJ[a-zA-Z0-9_-]{20,}\.[a-zA-Z0-9_-]{20,}\b/g },
  { id: "private-key", pattern: /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/g },
  {
    id: "service-role-assignment",
    pattern: /\b(?:SUPABASE_SERVICE_ROLE_KEY|SERVICE_ROLE_KEY|service_role)\b\s*[:=]\s*["']?([^\s"'`,;]+)/gi,
    valueGroup: 1,
  },
  { id: "postgres-connection-url", pattern: /\bpostgres(?:ql)?:\/\/[^\s"'`<>]+/gi },
  {
    id: "database-password-assignment",
    pattern: /\b(?:DATABASE_PASSWORD|DB_PASSWORD|POSTGRES_PASSWORD|SUPABASE_DB_PASSWORD)\b\s*[:=]\s*["']?([^\s"'`,;]+)/gi,
    valueGroup: 1,
  },
  {
    id: "bearer-token-assignment",
    pattern: /\b(?:AUTHORIZATION|BEARER_TOKEN)\b\s*[:=]\s*["']?(?:Bearer\s+)?([a-zA-Z0-9_~-]{16,})/gi,
    valueGroup: 1,
  },
  {
    id: "access-token-assignment",
    pattern: /\b(?:ACCESS_TOKEN|API_TOKEN|SUPABASE_ACCESS_TOKEN|CLOUDFLARE_API_TOKEN)\b\s*[:=]\s*["']?([a-zA-Z0-9_~-]{16,})/gi,
    valueGroup: 1,
  },
];

export function isSafeLocalDevelopmentValue(value) {
  const trimmed = value.trim();
  if (!trimmed) return false;
  return (
    /^(?:localhost|127\.0\.0\.1)$/i.test(trimmed) ||
    /^(?:http|https|ws|wss):\/\/(?:localhost|127\.0\.0\.1):54321(?:[/?#].*)?$/i.test(trimmed) ||
    /^(?:localhost|127\.0\.0\.1):54321$/i.test(trimmed)
  );
}

export function isSafePlaceholderValue(value) {
  const trimmed = value.trim().replace(/^["']|["']$/g, "");
  return (
    !trimmed ||
    /^(?:YOUR_|REPLACE_|EXAMPLE_)[A-Z0-9_]*$/i.test(trimmed) ||
    /^<[^>]+>$/.test(trimmed) ||
    /^\$\{[A-Z0-9_]+\}$/i.test(trimmed) ||
    /^https:\/\/YOUR_PROJECT_REF\.supabase\.co$/i.test(trimmed)
  );
}

function parseEnvironment(file) {
  if (!fs.existsSync(file)) return {};
  return Object.fromEntries(
    fs.readFileSync(file, "utf8").split(/\r?\n/)
      .map((line) => line.trim())
      .filter((line) => line && !line.startsWith("#") && line.includes("="))
      .map((line) => {
        const separator = line.indexOf("=");
        return [line.slice(0, separator).trim(), line.slice(separator + 1).trim()];
      }),
  );
}

function localEnvironment(root) {
  if (!fs.existsSync(root)) return {};
  const files = fs.readdirSync(root, { withFileTypes: true })
    .filter((entry) => entry.isFile() && entry.name.startsWith(".env") && entry.name !== ".env.example")
    .map((entry) => path.join(root, entry.name));
  return Object.assign({}, ...files.map(parseEnvironment));
}

function filesUnder(directory, ignored = new Set()) {
  if (!fs.existsSync(directory)) return [];
  const result = [];
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    if (ignored.has(entry.name) || entry.name.startsWith(".env")) continue;
    const target = path.join(directory, entry.name);
    if (entry.isDirectory()) result.push(...filesUnder(target, ignored));
    else if (entry.isFile()) result.push(target);
  }
  return result;
}

function patternMatches(content) {
  const findings = [];
  for (const rule of patternRules) {
    rule.pattern.lastIndex = 0;
    for (const match of content.matchAll(rule.pattern)) {
      const candidate = rule.valueGroup ? match[rule.valueGroup] : match[0];
      if (!isSafePlaceholderValue(candidate)) findings.push(rule.id);
    }
  }
  return findings;
}

function relativeFile(root, file) {
  return path.relative(root, file).replaceAll(path.sep, "/");
}

function finding(root, scope, rule, file) {
  return { scope, rule, file: relativeFile(root, file), value: redactedValue };
}

export function scanCredentials(root = process.cwd()) {
  const environment = localEnvironment(root);
  const environmentValues = Object.values(environment)
    .filter((value) => value.length >= 8)
    .filter((value) => !isSafeLocalDevelopmentValue(value) && !isSafePlaceholderValue(value));
  const findings = [];

  for (const file of filesUnder(root, sourceIgnored)) {
    const content = fs.readFileSync(file).toString("utf8");
    for (const value of environmentValues) {
      if (content.includes(value)) findings.push(finding(root, "source", "local-environment-value", file));
    }
    for (const rule of patternMatches(content)) findings.push(finding(root, "source", rule, file));
  }

  for (const artifactRoot of artifactRoots) {
    for (const file of filesUnder(path.join(root, artifactRoot))) {
      const content = fs.readFileSync(file).toString("utf8");
      for (const value of environmentValues) {
        if (content.includes(value)) findings.push(finding(root, "artifact", "local-environment-value", file));
      }
      for (const rule of patternMatches(content)) findings.push(finding(root, "artifact", rule, file));
    }
  }

  return {
    source_credential_matches: findings.filter((item) => item.scope === "source" && item.rule === "local-environment-value").length,
    source_secret_pattern_matches: findings.filter((item) => item.scope === "source" && item.rule !== "local-environment-value").length,
    artifact_test_credential_matches: findings.filter((item) => item.scope === "artifact" && item.rule === "local-environment-value").length,
    artifact_secret_pattern_matches: findings.filter((item) => item.scope === "artifact" && item.rule !== "local-environment-value").length,
    findings,
  };
}

export function hasCredentialMatches(result) {
  return result.source_credential_matches !== 0 ||
    result.source_secret_pattern_matches !== 0 ||
    result.artifact_test_credential_matches !== 0 ||
    result.artifact_secret_pattern_matches !== 0;
}

export function formatScanResult(result) {
  return JSON.stringify(result);
}

const isCommandLine = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isCommandLine) {
  const result = scanCredentials();
  console.log(formatScanResult(result));
  if (hasCredentialMatches(result)) process.exitCode = 1;
}
