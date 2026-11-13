export default defineAppConfig({
  site: {
    name: 'Grindstone',
    // the public address, for absolute links such as the share image
    url: 'https://grindstone.dkiessling.de',
    description: 'Practice real developer skills in short, game-like scenarios. First track: git.'
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
    // every button looks like one: outlined, a hover you can see, the hand cursor
    button: {
      slots: {
        base: 'cursor-pointer'
      },
      defaultVariants: {
        variant: 'outline'
      },
      compoundVariants: [
        { color: 'primary', variant: 'outline', class: 'hover:bg-primary/15 hover:ring-primary active:bg-primary/25' },
        { color: 'secondary', variant: 'outline', class: 'hover:bg-secondary/15 hover:ring-secondary active:bg-secondary/25' },
        { color: 'success', variant: 'outline', class: 'hover:bg-success/15 hover:ring-success active:bg-success/25' },
        { color: 'warning', variant: 'outline', class: 'hover:bg-warning/15 hover:ring-warning active:bg-warning/25' },
        { color: 'info', variant: 'outline', class: 'hover:bg-info/15 hover:ring-info active:bg-info/25' },
        { color: 'error', variant: 'outline', class: 'hover:bg-error/15 hover:ring-error active:bg-error/25' },
        { color: 'neutral', variant: 'outline', class: 'bg-transparent hover:bg-accented hover:ring-(--ui-border-inverted)/40 hover:text-highlighted active:bg-accented' }
      ]
    },
    // a dialog's title and description keep clear of its close button (absolute, top-4 end-4) at every width
    modal: { slots: { header: 'pe-14 sm:pe-14' } },
    // fields stand out from the page in light, sit on it in dark
    textarea: { compoundVariants: [{ variant: 'outline', class: 'bg-elevated dark:bg-default' }] }
  }
})
