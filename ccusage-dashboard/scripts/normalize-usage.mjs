// Reuse the web-import validator without requiring a running Next.js server.
// Compile only its dependency graph into a private temporary directory. Report
// content travels over stdin and is never written to the compilation directory.
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import ts from "typescript";

let buildDirectory;
try {
  const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
  buildDirectory = mkdtempSync(join(tmpdir(), "token-atlas-validator-"));
  const program = ts.createProgram(
    [join(root, "lib", "usage-import-validation.ts")],
    {
      target: ts.ScriptTarget.ES2022,
      module: ts.ModuleKind.CommonJS,
      moduleResolution: ts.ModuleResolutionKind.Node10,
      strict: true,
      skipLibCheck: true,
      noEmitOnError: true,
      rootDir: root,
      outDir: buildDirectory,
    },
  );
  if (program.emit().emitSkipped) {
    throw new Error(
      "Import validator could not compile. Run pnpm install and pnpm typecheck.",
    );
  }
  const { importLimit, validateUsageImport } = await import(
    pathToFileURL(join(buildDirectory, "lib", "usage-import-validation.js"))
      .href
  );
  const input = readFileSync(0, "utf8").replace(/^\uFEFF/, "");
  if (Buffer.byteLength(input, "utf8") > importLimit) {
    throw new Error("Import file exceeds 5 MB.");
  }
  const report = validateUsageImport(
    JSON.parse(input),
    process.argv[2] ?? "",
    process.argv[3] ?? "codex",
  );
  process.stdout.write(JSON.stringify(report, null, 2));
} catch (error) {
  process.stderr.write(
    `${error instanceof Error ? error.message : "Import validation failed."}\n`,
  );
  process.exitCode = 1;
} finally {
  if (buildDirectory) rmSync(buildDirectory, { recursive: true, force: true });
}
