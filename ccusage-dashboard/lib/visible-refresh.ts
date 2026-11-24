/** Visible pages poll after their previous refresh settles; hidden ones are idle. */
export function watchVisibleRefresh(
  page: Pick<
    Document,
    "visibilityState" | "addEventListener" | "removeEventListener"
  >,
  refresh: () => Promise<unknown>,
  interval: number,
  timers: {
    now: () => number;
    set: (run: () => void, delay: number) => number;
    clear: (id: number) => void;
  },
) {
  let active = true;
  let scheduled: number | undefined;
  let pending = false;
  let nextRefresh = timers.now();
  function clear() {
    if (scheduled !== undefined) timers.clear(scheduled);
    scheduled = undefined;
  }
  function schedule() {
    clear();
    if (!active || pending || page.visibilityState !== "visible") return;
    scheduled = timers.set(
      () => void run(),
      Math.max(0, nextRefresh - timers.now()),
    );
  }
  async function run() {
    clear();
    if (!active || pending || page.visibilityState !== "visible") return;
    pending = true;
    try {
      await refresh();
    } catch {
      // A transient read error is surfaced by the report and retried later.
    } finally {
      pending = false;
      nextRefresh = timers.now() + interval;
      schedule();
    }
  }
  page.addEventListener("visibilitychange", schedule);
  schedule();
  return () => {
    active = false;
    clear();
    page.removeEventListener("visibilitychange", schedule);
  };
}
