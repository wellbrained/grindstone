// The debrief's result strip (DebriefResults.vue): one count per cell, its label beside it.
export interface ResultItem {
  label: string
  value: string | number
  /** A quieter addition to the value ('shortest solution 3'). */
  note?: string
  testid?: string
}
