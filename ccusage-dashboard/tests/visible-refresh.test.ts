import assert from "node:assert/strict";
import test from "node:test";
import { watchVisibleRefresh } from "../lib/visible-refresh";
import { PERFORMANCE_REFRESH_MS } from "../lib/performance-types";

class Page extends EventTarget {
  visibilityState: DocumentVisibilityState = "visible";
  show(state: DocumentVisibilityState) {
    this.visibilityState = state;
    this.dispatchEvent(new Event("visibilitychange"));
  }
}

test("request auto-refresh is 60 seconds, pauses while hidden and resumes without overlap", async () => {
  const page = new Page();
  const scheduled = new Map<number, { run: () => void; delay: number }>();
  let clock = 0;
  let calls = 0;
  let settle!: () => void;
  const stop = watchVisibleRefresh(
    page,
    () => {
      calls++;
      return new Promise<void>((resolve) => {
        settle = resolve;
      });
    },
    PERFORMANCE_REFRESH_MS,
    {
      set: (run, delay) => {
        scheduled.set(++clock, { run, delay });
        return clock;
      },
      clear: (id) => {
        scheduled.delete(id);
      },
    },
  );
  function fire(delay: number) {
    assert.equal(scheduled.size, 1);
    const [current] = scheduled.values();
    assert.equal(current.delay, delay);
    current.run();
  }
  fire(0);
  assert.equal(calls, 1);
  page.show("hidden");
  page.show("visible");
  assert.equal(calls, 1, "visibility cannot overlap a fetch");
  settle();
  await Promise.resolve();
  fire(60_000);
  assert.equal(calls, 2);
  settle();
  await Promise.resolve();
  page.show("hidden");
  assert.equal(scheduled.size, 0);
  page.show("visible");
  assert.equal(calls, 3);
  stop();
  settle();
  await Promise.resolve();
  assert.equal(scheduled.size, 0, "unmount clears listeners and timers");
});
