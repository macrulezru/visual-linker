/** Batches ResizeObserver callbacks for any number of observed elements into one rAF-scheduled notification. */
export function createResizeWatcher(onChange: () => void) {
  const observed = new Set<HTMLElement>()
  let scheduled = false

  function schedule() {
    if (scheduled) return
    scheduled = true
    requestAnimationFrame(() => {
      scheduled = false
      onChange()
    })
  }

  const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(schedule)

  return {
    observe(el: HTMLElement) {
      if (observed.has(el)) return
      observed.add(el)
      observer?.observe(el)
    },
    unobserveAll() {
      for (const el of observed) observer?.unobserve(el)
      observed.clear()
    },
    scheduleNow: schedule,
    destroy() {
      observer?.disconnect()
      observed.clear()
    },
  }
}
