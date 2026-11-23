import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";

const [mode, ...args] = process.argv.slice(2).filter((arg) => arg !== "--");
if (
  (mode !== "dev" && mode !== "start") ||
  args.some((arg) => /^(?:--hostname(?:=|$)|-H)/.test(arg))
) {
  console.error(
    "Use this launcher for loopback only. For LAN, run Next directly with the request view disabled.",
  );
  process.exit(1);
}

const server = spawn(
  process.execPath,
  [
    fileURLToPath(import.meta.resolve("next/dist/bin/next")),
    mode,
    "--hostname",
    "127.0.0.1",
    ...args,
  ],
  {
    stdio: "inherit",
    env: { ...process.env, TOKEN_ATLAS_LOCAL_PERFORMANCE: "1" },
    windowsHide: true,
  },
);
for (const signal of ["SIGINT", "SIGTERM"])
  process.once(signal, () => server.kill(signal));
server.on("error", (error) => {
  console.error("Token Atlas could not start:", error.message);
  process.exitCode = 1;
});
server.on("exit", (code) => {
  process.exitCode = code ?? 1;
});
