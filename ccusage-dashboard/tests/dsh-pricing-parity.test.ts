import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, dirname, join, resolve } from "node:path";
import test from "node:test";
import { promisify } from "node:util";
import { readDshUsage } from "../lib/dsh-usage";
import { usagePeriodsFrom } from "../lib/usage-domain";
import {
  buildUsageViewExport,
  usagePricingMetadata,
} from "../lib/usage-export";
import { resolveUsageRange } from "../lib/usage-range";
import { assembleUsageSnapshot } from "../lib/usage-snapshot";

const exec = promisify(execFile);
const cli = resolve("node_modules/ccusage/src/cli.js");
const date = "2026-11-20";
const timestamp = `${date}T11:00:00Z`;
const model = "claude-opus-5-5";

test("DSH Opus 5.5 uses the same official USD rates as a Claude Code report", async () => {
  const root = await mkdtemp(join(tmpdir(), "token-atlas-dsh-parity-"));
  try {
    const claudeDir = join(root, "claude");
    const ccProjects = join(claudeDir, "projects", "fixture");
    const sessions = join(root, "sessions", "fixture", "opus-5-5");
    await Promise.all([
      mkdir(ccProjects, { recursive: true }),
      mkdir(sessions, { recursive: true }),
    ]);
    const tokens = {
      inputTokens: 10_000,
      cacheReadTokens: 100_000,
      cacheWriteTokens: 1_000,
      outputTokens: 500,
      totalTokens: 111_500,
    };
    const writeLog = (path: string, rows: unknown[]) =>
      writeFile(path, rows.map((row) => JSON.stringify(row)).join("\n") + "\n");
    await Promise.all([
      writeLog(join(ccProjects, "opus-5-5.jsonl"), [
        {
          type: "assistant",
          timestamp,
          sessionId: "cc-parity",
          requestId: "req_parity",
          message: {
            id: "msg_parity",
            model,
            usage: {
              input_tokens: tokens.inputTokens,
              cache_read_input_tokens: tokens.cacheReadTokens,
              cache_creation_input_tokens: tokens.cacheWriteTokens,
              output_tokens: tokens.outputTokens,
            },
          },
        },
      ]),
      writeLog(join(sessions, "session.v4.jsonl"), [
        { type: "session", version: 4, id: "dsh-parity", isSeeded: false },
        {
          type: "assistant/message",
          time: timestamp,
          seq: 1,
          data: {
            message: { id: "turn-one", source: { kind: "model", model } },
            usage: tokens,
          },
        },
      ]),
    ]);
    const range = resolveUsageRange({
      start: date,
      end: date,
      timezone: "UTC",
    });
    const [native, dsh] = await Promise.all([
      exec(
        process.execPath,
        [
          cli,
          "claude",
          "daily",
          "--json",
          "--offline",
          "--mode",
          "calculate",
          "--timezone",
          "UTC",
          "--since",
          date,
          "--until",
          date,
        ],
        {
          cwd: root,
          env: {
            NODE_ENV: "test",
            SystemRoot: process.env.SystemRoot,
            CLAUDE_CONFIG_DIR: claudeDir,
            NO_COLOR: "1",
          },
          windowsHide: true,
          timeout: 15_000,
        },
      ),
      readDshUsage(range, root),
    ]);
    const [ccDay] = usagePeriodsFrom(JSON.parse(native.stdout), "daily");
    const [dshDay] = dsh.daily;
    // USD / 1M: $4 input, $0.20 hit, $5 default 5m write, $20 output.
    assert.ok(
      Math.abs(ccDay.costUSD - 0.075) < 1e-10,
      `Claude Code: ${ccDay.costUSD}`,
    );
    assert.ok(
      Math.abs(dshDay.costUSD - ccDay.costUSD) < 1e-10,
      `DSH: ${dshDay.costUSD}`,
    );
    assert.equal(dshDay.unpricedModels, undefined);
    assert.equal(dshDay.totalTokens, tokens.totalTokens);
    assert.equal(dsh.sessions[0].costUSD, dshDay.costUSD);
    const snapshot = assembleUsageSnapshot({
      range,
      source: "dsh",
      device: "local",
      local: dsh,
      imports: { devices: [], dailyByDevice: {}, warnings: [] },
    });
    const exported = buildUsageViewExport(snapshot, "dsh");
    assert.equal(exported.dshOpusPricing?.cacheWriteTtl, "5m");
    assert.equal(exported.dshOpusPricing?.serviceTier, "standard");
    assert.equal(exported.dshPricing, undefined);
    assert.equal(exported.dshAstraPricing, undefined);
    assert.equal(usagePricingMetadata(snapshot, []).dshOpusPricing, undefined);
    assert.equal(snapshot.warnings.length, 0);
  } finally {
    assert.equal(dirname(root), resolve(tmpdir()));
    assert.ok(basename(root).startsWith("token-atlas-dsh-parity-"));
    await rm(root, { recursive: true, force: true });
  }
});
