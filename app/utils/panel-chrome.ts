import type { InjectionKey } from 'vue'

// What a Debugging or Web panel's header shows when a tab already names the panel (docs/features/ui.md, "Debugging play
// page"). DebuggingPlay provides it: below lg every panel is a phone tab, from lg a panel under the code is a tab when
// there are several. There the header drops its own name (icon and title), and the Console's and Network's actions
// (Clear) move into the tab row beside the tabs, so the panel starts with its content. Without it (the same panels in
// Working with AI's Run the PR) a header keeps its name and actions.
export interface PanelChrome {
  /** Classes for a header's name (icon and title): hidden where a tab names the panel. */
  nameClass: string
  /** The panel's actions sit in the tab row (from lg, this panel is the open one of several); reactive. */
  actionsInTabRow: (panel: string) => boolean
}

export const PANEL_CHROME: InjectionKey<PanelChrome> = Symbol('panelChrome')

/** The element in the tab row the open panel's actions are teleported into. */
export const PANEL_ACTIONS_TARGET = '#debugging-lower-actions'
