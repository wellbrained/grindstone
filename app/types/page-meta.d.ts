// Typed custom page meta. Pages set it with `definePageMeta({ example: { … } })`;
// the /examples overview lists every route that has it (including pages from layers).
declare module '#app' {
  interface PageMeta {
    example?: {
      title: string
      description: string
      icon: string
      /** Sort position in the overview (lower first) */
      order?: number
    }
  }
}

export {}
