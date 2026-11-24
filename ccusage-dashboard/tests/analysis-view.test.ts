import assert from "node:assert/strict";
import test from "node:test";
import { supportsRequestTiming } from "../lib/performance-types";
import {
  isPerformanceView,
  workspaceQuery,
  workspaceState,
} from "../lib/workspace-state";

test("the analysis deep link keeps its tab and filters through a URL round trip", () => {
  const state = workspaceState(
    new URLSearchParams(
      "view=analysis&section=performance&source=dsh&device=local&days=all",
    ),
  );
  const url = new URLSearchParams(workspaceQuery(state));
  assert.equal(url.get("section"), "performance");
  assert.equal(url.get("source"), "dsh");
  assert.equal(url.get("device"), "local");
  assert.equal(url.get("days"), "all");
  assert.deepEqual(workspaceState(url), state);
  assert.equal(isPerformanceView(state), true);
  assert.equal(supportsRequestTiming(state.source), false);
  assert.equal(supportsRequestTiming("codex"), true);
  assert.equal(supportsRequestTiming("all"), true);
});

test("legacy request links open the performance tab without bringing a request view back to navigation", () => {
  const state = workspaceState(new URLSearchParams("view=requests&days=7"));
  const url = new URLSearchParams(workspaceQuery(state));
  assert.equal(url.get("view"), "analysis");
  assert.equal(url.get("section"), "performance");
  assert.equal(url.get("days"), "7");
});

test("ordinary overview and trend links cannot activate timing", () => {
  for (const query of [
    "view=overview&section=performance",
    "view=analysis",
    "view=analysis&section=unrecognized",
  ]) {
    const state = workspaceState(new URLSearchParams(query));
    assert.equal(isPerformanceView(state), false);
    assert.equal(
      new URLSearchParams(workspaceQuery(state)).has("section"),
      false,
    );
  }
});
