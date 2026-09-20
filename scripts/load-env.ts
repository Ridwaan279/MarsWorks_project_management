import { readFileSync } from "node:fs";
import path from "node:path";

/**
 * Loads .env into process.env.
 *
 * Node's own process.loadEnvFile() cannot be used here: it does not throw on a
 * file it fails to understand, it simply loads nothing. A .env saved by a
 * Windows editor is usually UTF-16, or UTF-8 with a byte-order mark, and in
 * both cases every variable silently disappears -- which surfaces much later
 * as "DATABASE_URL is not set" on a file that plainly contains it.
 *
 * So: decode the bytes properly, parse them here, and say what happened.
 */

/** Decode a .env whatever encoding the editor that saved it chose. */
function decode(buffer: Buffer): string {
  if (buffer[0] === 0xff && buffer[1] === 0xfe) {
    return buffer.subarray(2).toString("utf16le");
  }
  if (buffer[0] === 0xfe && buffer[1] === 0xff) {
    // UTF-16BE: swap each pair, since Node decodes little-endian only.
    const swapped = Buffer.from(buffer.subarray(2));
    swapped.swap16();
    return swapped.toString("utf16le");
  }
  if (buffer[0] === 0xef && buffer[1] === 0xbb && buffer[2] === 0xbf) {
    return buffer.subarray(3).toString("utf8");
  }
  return buffer.toString("utf8");
}

function parse(text: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    const eq = line.indexOf("=");
    if (eq === -1) continue;
    const key = line.slice(0, eq).trim();
    if (!key) continue;
    let value = line.slice(eq + 1).trim();
    // Strip one matching pair of surrounding quotes.
    if (
      (value.startsWith('"') && value.endsWith('"') && value.length > 1) ||
      (value.startsWith("'") && value.endsWith("'") && value.length > 1)
    ) {
      value = value.slice(1, -1);
    }
    out[key] = value;
  }
  return out;
}

export interface LoadEnvResult {
  /** False when there is no .env at all, which is normal on a hosted platform. */
  found: boolean;
  /** Names read from the file, whether or not they were already set. */
  keys: string[];
}

/**
 * Reads .env from `cwd` and copies anything not already in the environment.
 * Real environment variables win, so `DATABASE_URL=... npm run ...` still
 * overrides the file.
 */
export function loadLocalEnv(cwd: string = process.cwd()): LoadEnvResult {
  const file = path.join(cwd, ".env");
  let buffer: Buffer;
  try {
    buffer = readFileSync(file);
  } catch {
    return { found: false, keys: [] };
  }

  const parsed = parse(decode(buffer));
  const keys = Object.keys(parsed);

  if (keys.length === 0 && buffer.length > 0) {
    throw new Error(
      `${file} exists but no variables could be read from it.\n` +
        "This is almost always the file's encoding: Notepad and PowerShell\n" +
        "redirection save UTF-16 or add a byte-order mark. Re-save it as UTF-8,\n" +
        'or write it from PowerShell with:\n' +
        "  Set-Content -Path .env -Encoding utf8 -Value '<line>'",
    );
  }

  for (const [key, value] of Object.entries(parsed)) {
    if (process.env[key] === undefined) process.env[key] = value;
  }
  return { found: true, keys };
}
