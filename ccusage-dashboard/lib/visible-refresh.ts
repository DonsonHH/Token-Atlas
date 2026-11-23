/** Visible pages poll after their previous refresh settles; hidden ones are idle. */
export function watchVisibleRefresh(
  page: Pick<
    Document,
    "visibilityState" | "addEventListener" | "removeEventListener"
  >,
  refresh: () => Promise<unknown>,
  interval: number,
  timers: {
    set: (run: () => void, delay: number) => number;
    clear: (id: number) => void;
  },
) {
  let active = true;
  let scheduled: number | undefined;
  let pending = false;
  function clear() {
    if (scheduled !== undefined) timers.clear(scheduled);
    scheduled = undefined;
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
      if (active && page.visibilityState === "visible")
        scheduled = timers.set(() => void run(), interval);
    }
  }
  function onVisibility() {
    clear();
    if (page.visibilityState === "visible") void run();
  }
  page.addEventListener("visibilitychange", onVisibility);
  if (page.visibilityState === "visible")
    scheduled = timers.set(() => void run(), 0);
  return () => {
    active = false;
    clear();
    page.removeEventListener("visibilitychange", onVisibility);
  };
}
