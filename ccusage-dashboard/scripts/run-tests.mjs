import { spawnSync } from "node:child_process";
import { readdirSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../", import.meta.url));
// tsc leaves deleted source files' JavaScript in .test-build.
const tests = readdirSync(join(root, "tests"), { withFileTypes: true })
  .filter((entry) => entry.isFile() && entry.name.endsWith(".test.ts"))
  .map(({ name }) => join(".test-build", "tests", name.replace(/\.ts$/, ".js")))
  .sort();
if (!tests.length) throw new Error("No test sources found");
const result = spawnSync(process.execPath, ["--test", ...tests], {
  cwd: root,
  stdio: "inherit",
});
if (result.error) console.error(result.error.message);
process.exitCode = result.status ?? 1;
