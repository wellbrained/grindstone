// Learning events for the visit stats (self-hosted Umami, docs/analytics.md). No personal data: level ids and counts.
// The tracker only loads on the live domain, so in dev and tests these calls do nothing.

export type AnalyticsEvent = 'level-start' | 'level-solved' | 'hint'

declare global {
  interface Window {
    umami?: { track: (event: string, data?: Record<string, string | number>) => void }
  }
}

export function trackEvent(event: AnalyticsEvent, data: Record<string, string | number>) {
  try {
    window.umami?.track(event, data)
  } catch {
    // stats must never break the app
  }
}
