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

test("request auto-refresh pauses while hidden without losing its 60-second cadence", async () => {
  const page = new Page();
  const scheduled = new Map<number, { run: () => void; delay: number }>();
  let timerId = 0;
  let now = 1000;
  let calls = 0;
  let settle!: () => void;
  const timers = {
    now: () => now,
    set: (run: () => void, delay: number) => {
      scheduled.set(++timerId, { run, delay });
      return timerId;
    },
    clear: (id: number) => {
      scheduled.delete(id);
    },
  };
  const stop = watchVisibleRefresh(
    page,
    () => {
      calls++;
      return new Promise<void>((resolve) => {
        settle = resolve;
      });
    },
    PERFORMANCE_REFRESH_MS,
    timers,
  );
  function fire(delay: number) {
    assert.equal(scheduled.size, 1);
    const [current] = scheduled.values();
    assert.equal(current.delay, delay);
    now += delay;
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
  now += 10_000;
  page.show("visible");
  assert.equal(calls, 2, "showing a tab cannot bypass the cooldown");
  fire(50_000);
  assert.equal(calls, 3);
  stop();
  settle();
  await Promise.resolve();
  assert.equal(scheduled.size, 0, "unmount clears listeners and timers");
});
