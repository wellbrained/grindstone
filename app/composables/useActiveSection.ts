// Which chapter section of the track page is being read, for the rail's and the strip's aria-current.
// A section is current once its top passes a line just below the sticky header (and the chapter strip, below lg); at the
// end of the page the last one is. A jump from the rail pins its chapter until the reader scrolls by hand, so a short
// chapter near the end, which can never reach the line, still shows as the one you picked.
export function useActiveSection(ids: () => readonly string[]) {
  const active = ref<string | null>(null)
  let pinned = false
  let frame = 0

  function readingLine(): number {
    const header = document.querySelector('header')?.getBoundingClientRect().bottom ?? 0
    const strip = document.querySelector('[data-chapter-strip]')?.getBoundingClientRect()
    return Math.max(header, strip && strip.height > 0 ? strip.bottom : 0) + 32
  }

  function update() {
    frame = 0
    const list = ids()
    if (pinned || list.length === 0) return
    const line = readingLine()
    let current = list[0]!
    for (const id of list) {
      const top = document.getElementById(id)?.getBoundingClientRect().top
      if (top !== undefined && top <= line) current = id
    }
    const atEnd = window.innerHeight + window.scrollY >= document.documentElement.scrollHeight - 4
    active.value = atEnd ? list.at(-1)! : current
  }

  function schedule() {
    if (!frame) frame = requestAnimationFrame(update)
  }

  function release() {
    if (!pinned) return
    pinned = false
    schedule()
  }

  /** Marks a chapter as current until the reader scrolls by hand (wheel, touch or a key). */
  function pin(id: string) {
    pinned = true
    active.value = id
  }

  useEventListener('scroll', schedule, { passive: true })
  useEventListener('resize', schedule, { passive: true })
  useEventListener('wheel', release, { passive: true })
  useEventListener('touchmove', release, { passive: true })
  useEventListener('keydown', release)

  onMounted(() => {
    // arriving with a hash (/git#merging, from the play page's breadcrumb): that chapter is the one you came for
    const hash = decodeURIComponent(window.location.hash.slice(1))
    if (hash && ids().includes(hash)) pin(hash)
    else update()
  })
  onScopeDispose(() => cancelAnimationFrame(frame))

  return { active, pin }
}
