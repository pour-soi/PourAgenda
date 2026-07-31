import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const sourceIgnored = new Set([
  ".git", ".next", ".open-next", ".wrangler", "node_modules",
  "playwright-report", "test-results",
]);
const artifactRoots = [".next", ".open-next", "playwright-report", "test-results"];
const secretPattern = /(?:sb_secret_[a-z0-9_-]{16,}|-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----|eyJ[a-zA-Z0-9_-]{20,}\.eyJ[a-zA-Z0-9_-]{20,}\.[a-zA-Z0-9_-]{20,})/g;

function isSafeLocalDevelopmentValue(value) {
  const trimmed = value.trim();
  if (!trimmed) return false;
  return (
    /^(?:localhost|127\.0\.0\.1)$/.test(trimmed) ||
    /^(?:http|https|ws|wss):\/\/(?:localhost|127\.0\.0\.1):54321(?:[/?#].*)?$/i.test(trimmed) ||
    /^(?:localhost|127\.0\.0\.1):54321$/i.test(trimmed)
  );
}

function parseEnvironment(file) {
  if (!fs.existsSync(file)) return {};
  return Object.fromEntries(
    fs.readFileSync(file, "utf8").split(/\r?\n/)
      .filter((line) => line && !line.startsWith("#") && line.includes("="))
      .map((line) => {
        const separator = line.indexOf("=");
        return [line.slice(0, separator), line.slice(separator + 1)];
      }),
  );
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

const appEnvironment = parseEnvironment(path.join(root, ".env.local"));
const testEnvironment = parseEnvironment(path.join(root, ".env.rls-test"));
const sourceValues = [...Object.values(appEnvironment), ...Object.values(testEnvironment)]
  .filter((value) => value.length >= 8 && !isSafeLocalDevelopmentValue(value));
const artifactValues = Object.entries(testEnvironment)
  .filter(([name, value]) => /PASSWORD|EMAIL/.test(name) && value.length >= 8)
  .map(([, value]) => value);

let sourceCredentialMatches = 0;
let sourceSecretPatternMatches = 0;
for (const file of filesUnder(root, sourceIgnored)) {
  const content = fs.readFileSync(file).toString("utf8");
  sourceCredentialMatches += sourceValues.filter((value) => content.includes(value)).length;
  secretPattern.lastIndex = 0;
  sourceSecretPatternMatches += [...content.matchAll(secretPattern)].length;
}

let artifactCredentialMatches = 0;
let artifactSecretPatternMatches = 0;
for (const artifactRoot of artifactRoots) {
  for (const file of filesUnder(path.join(root, artifactRoot))) {
    const content = fs.readFileSync(file).toString("utf8");
    artifactCredentialMatches += artifactValues.filter((value) => content.includes(value)).length;
    secretPattern.lastIndex = 0;
    artifactSecretPatternMatches += [...content.matchAll(secretPattern)].length;
  }
}

const result = {
  source_credential_matches: sourceCredentialMatches,
  source_secret_pattern_matches: sourceSecretPatternMatches,
  artifact_test_credential_matches: artifactCredentialMatches,
  artifact_secret_pattern_matches: artifactSecretPatternMatches,
};
console.log(JSON.stringify(result));
if (Object.values(result).some((count) => count !== 0)) process.exitCode = 1;
