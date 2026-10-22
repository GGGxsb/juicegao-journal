import { randomBytes, createHash } from "node:crypto";
import { writeFile } from "node:fs/promises";
import { resolve } from "node:path";

const args = process.argv.slice(2);
const supported = new Set(["--setup-origin", "--app-origin", "--help"]);
if (args.includes("--help")) {
  console.log("Usage: node scripts/setup-admin.mjs [--setup-origin http://localhost:8081] [--app-origin https://your-domain.example]");
  console.log("Creates a new .env without overwriting an existing one. The setup link is shown once; keep it private until the administrator account is created.");
  process.exit(0);
}

function option(name, fallback) {
  const at = args.indexOf(name);
  if (at < 0) return fallback;
  const value = args[at + 1];
  if (!value || value.startsWith("--")) throw new Error(`${name} needs a value.`);
  return value;
}

function origin(input, label) {
  const url = new URL(input);
  if (url.username || url.password || url.search || url.hash || url.pathname !== "/") {
    throw new Error(`${label} must contain only the scheme, host, and optional port.`);
  }
  const local = ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname);
  if (url.protocol !== "https:" && !(url.protocol === "http:" && local)) {
    throw new Error(`${label} must use HTTPS, or HTTP on localhost for an SSH tunnel.`);
  }
  return url.origin;
}

try {
  for (let index = 0; index < args.length; index += 2) {
    if (!supported.has(args[index])) throw new Error(`Unknown option: ${args[index]}`);
  }
  const appOriginValue = option("--app-origin", "");
  const appOrigin = appOriginValue ? origin(appOriginValue, "--app-origin") : "";
  const setupOrigin = origin(option("--setup-origin", appOrigin || "http://localhost:8081"), "--setup-origin");
  const token = randomBytes(32).toString("base64url");
  const hash = createHash("sha256").update(token).digest("hex");
  const envPath = resolve(process.cwd(), ".env");
  const content = [
    "# Generated locally. Do not commit or share this file.",
    `ADMIN_SETUP_TOKEN_HASH=${hash}`,
    `APP_ORIGIN=${appOrigin}`,
    "JOURNAL_DATA_VOLUME=juicegao_data",
    "HTTP_BIND=0.0.0.0",
    "HTTP_PORT=8080",
    "",
  ].join("\n");
  await writeFile(envPath, content, { flag: "wx", mode: 0o600 });
  console.log(`Created ${envPath}`);
  console.log("Private one-time administrator setup link:");
  console.log(`${setupOrigin}/admin#setup=${token}`);
  console.log("Save this link privately until setup is finished. After the first administrator is created, the link no longer creates accounts.");
} catch (error) {
  if (error?.code === "EEXIST") {
    console.error("An .env file already exists. Nothing was changed. Use the previously saved setup link or your administrator username and password.");
  } else {
    console.error(error instanceof Error ? error.message : error);
  }
  process.exit(1);
}
