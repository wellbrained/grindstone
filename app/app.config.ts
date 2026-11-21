export default defineAppConfig({
  site: {
    name: 'Grindstone',
    // the public address, for absolute links such as the share image
    url: 'https://grindstone.dkiessling.de',
    description: 'Practice real developer skills in short, game-like scenarios. Four tracks: Git, Debugging, Working with AI and Web fundamentals.'
  },

  ui: {
    // the look is docs/adr/0003-look.md; the exact shades are set per theme in assets/css/main.css (--ui-primary etc.)
    colors: {
      primary: 'orange',
      secondary: 'violet',
      success: 'green',
      warning: 'amber',
      info: 'blue',
      error: 'rose',
      neutral: 'slate'
    },
    // every button looks like one: outlined, a hover you can see, the hand cursor; a coloured one's text moves a step
    // toward the highlighted text on hover, so it keeps 4.5:1 on its tint (main.css, --app-ink-*)
    button: {
      slots: {
        base: 'cursor-pointer'
      },
      defaultVariants: {
        variant: 'outline'
      },
      compoundVariants: [
        { color: 'primary', variant: 'outline', class: 'hover:bg-primary/15 hover:ring-primary hover:text-(--app-ink-primary) active:bg-primary/25 active:text-(--app-ink-primary)' },
        { color: 'secondary', variant: 'outline', class: 'hover:bg-secondary/15 hover:ring-secondary hover:text-(--app-ink-secondary) active:bg-secondary/25 active:text-(--app-ink-secondary)' },
        { color: 'success', variant: 'outline', class: 'hover:bg-success/15 hover:ring-success hover:text-(--app-ink-success) active:bg-success/25 active:text-(--app-ink-success)' },
        { color: 'warning', variant: 'outline', class: 'hover:bg-warning/15 hover:ring-warning hover:text-(--app-ink-warning) active:bg-warning/25 active:text-(--app-ink-warning)' },
        { color: 'info', variant: 'outline', class: 'hover:bg-info/15 hover:ring-info hover:text-(--app-ink-info) active:bg-info/25 active:text-(--app-ink-info)' },
        { color: 'error', variant: 'outline', class: 'hover:bg-error/15 hover:ring-error hover:text-(--app-ink-error) active:bg-error/25 active:text-(--app-ink-error)' },
        { color: 'neutral', variant: 'outline', class: 'bg-transparent hover:bg-accented hover:ring-(--ui-border-inverted)/40 hover:text-highlighted active:bg-accented' }
      ]
    },
    // focus: one 2px ember outline everywhere (main.css); the nav's own faint ring on a pseudo element goes
    navigationMenu: { slots: { link: 'focus-visible:before:outline-0', childLink: 'focus-visible:before:outline-0' } },
    // a dialog's title and description keep clear of its close button (absolute, top-4 end-4) at every width
    modal: { slots: { header: 'pe-14 sm:pe-14' } },
    // fields stand out from the page in light, sit on it in dark
    textarea: { compoundVariants: [{ variant: 'outline', class: 'bg-elevated dark:bg-default' }] }
  }
})
