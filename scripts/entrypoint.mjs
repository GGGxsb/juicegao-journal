import { spawn } from "node:child_process";

const hash = process.env.ADMIN_SETUP_TOKEN_HASH ?? "";
if (!/^[a-f0-9]{64}$/i.test(hash)) {
  console.error("ADMIN_SETUP_TOKEN_HASH is missing or invalid. Run scripts/setup-admin.mjs before starting the application.");
  process.exit(1);
}

let activeChild;
let stoppingSignal;
for (const signal of ["SIGTERM", "SIGINT"]) {
  process.on(signal, () => {
    stoppingSignal = signal;
    activeChild?.kill(signal);
  });
}

function run(file) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [file], { stdio: "inherit", env: process.env });
    activeChild = child;
    child.once("error", reject);
    child.once("exit", (code, signal) => {
      activeChild = undefined;
      resolve({ code, signal });
    });
    if (stoppingSignal) child.kill(stoppingSignal);
  });
}

try {
  const migration = await run("scripts/migrate.mjs");
  if (migration.code !== 0 || migration.signal || stoppingSignal) {
    process.exit(migration.code || (migration.signal === "SIGINT" ? 130 : 143));
  }
  const server = await run("server.js");
  process.exit(server.code ?? (server.signal === "SIGINT" ? 130 : 143));
} catch (error) {
  console.error("Application startup failed:", error);
  process.exit(1);
}
