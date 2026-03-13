#!/usr/bin/env node

const fs = require("fs");
const path = require("path");

const projectRoot = path.resolve(__dirname, "..");
const nextEnvPath = path.join(projectRoot, "conformance-stack", "packages", "cts", ".env.local");
const sourceEnvFiles = [
  path.join(projectRoot, ".env"),
  path.join(projectRoot, "conformance-stack", ".env")
];

const parseEnvFile = (filePath) => {
  if (!fs.existsSync(filePath)) {
    return {};
  }
  const raw = fs.readFileSync(filePath, "utf8");
  const result = {};
  raw.split(/\r?\n/).forEach((line) => {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#") || !trimmed.includes("=")) {
      return;
    }
    const idx = trimmed.indexOf("=");
    const key = trimmed.slice(0, idx).trim();
    let value = trimmed.slice(idx + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    result[key] = value;
  });
  return result;
};

const stringifyValue = (value) => {
  if (value == null) return "";
  if (/[\s#"'`]/.test(value)) {
    return JSON.stringify(value);
  }
  return value;
};

const collectSourceVars = () => {
  const collected = {};

  // Load from env files first (lower priority)
  sourceEnvFiles.forEach((filePath) => {
    const parsed = parseEnvFile(filePath);
    Object.entries(parsed).forEach(([key, value]) => {
      if (!key.startsWith("NEXT_PUBLIC_")) return;
      if (collected[key] == null) {
        collected[key] = value;
      }
    });
  });

  // Overlay actual environment variables
  Object.keys(process.env).forEach((key) => {
    if (!key.startsWith("NEXT_PUBLIC_")) return;
    collected[key] = process.env[key];
  });

  return collected;
};

const writeNextEnv = (values) => {
  const existing = parseEnvFile(nextEnvPath);
  const preserved = {};
  Object.entries(existing).forEach(([key, value]) => {
    if (!key.startsWith("NEXT_PUBLIC_")) {
      preserved[key] = value;
    }
  });

  const finalEntries = {
    ...preserved,
    ...values
  };

  const lines = Object.entries(finalEntries).map(([key, value]) => `${key}=${stringifyValue(value ?? "")}`);

  fs.mkdirSync(path.dirname(nextEnvPath), { recursive: true });
  fs.writeFileSync(nextEnvPath, lines.join("\n") + "\n");
  return lines.length;
};

(() => {
  const sourceVars = collectSourceVars();
  if (Object.keys(sourceVars).length === 0) {
    console.warn("[sync-next-env] No NEXT_PUBLIC_* variables found. Nothing to write.");
    return;
  }

  const total = writeNextEnv(sourceVars);
  console.log(`[sync-next-env] Synced ${Object.keys(sourceVars).length} NEXT_PUBLIC variables to ${path.relative(projectRoot, nextEnvPath)} (${total} total entries).`);
})();
