// Other sites in a Web fundamentals level (ADR 0009, chapter 2: "the attacker site cheap-flour.example, readable, not
// editable"): a page on another site that Lena opens while she is signed in at Corner Bakery, and what it makes her
// browser do: load an image, send a fetch, post a form that submits itself, or follow a link she clicks. The frame has
// no network and no second tab, so a site is data: its actions run in the web backend (backend.ts) through the same
// cookie and CORS models as the shop's page, each request in the Network panel tagged with the site, and its page is
// shown as HTML written from those very actions (`sitePage`), so what you read is what runs.

/** One thing the page makes the browser do, in order (a form or a link navigates away: nothing after it runs). */
export type SiteAction
  /** `<img src>`: a GET for an image (no-cors, with the cookies a cross-site image may carry). */
  = | { img: string }
  /** `fetch(url, { method, credentials, mode, body })`: a body is sent as a form (URLSearchParams). */
    | { fetch: string, method?: 'GET' | 'POST', credentials?: 'omit' | 'same-origin' | 'include', mode?: 'cors' | 'no-cors', body?: Readonly<Record<string, string>> }
  /** A hidden `<form>` the page submits itself: a top-level navigation (POST with its fields as a form body, or GET). */
    | { form: string, method: 'GET' | 'POST', fields: Readonly<Record<string, string>> }
  /** A link Lena clicks: a top-level GET navigation. */
    | { link: string, text: string }
  /**
   * Chapter 7: an `<iframe>` of another page (the shop's), maybe see-through over the page's own button (`over`). Its
   * answer's X-Frame-Options and frame-ancestors decide whether it shows; shown, Lena's click lands on the framed page's
   * button (`click`: what that button sends, as the framed page, with the cookies a page in another site's frame gets).
   * `via`: the page frames that other site's page (an origin), which frames this one (both are the frame's ancestors).
   */
    | { frame: string, over?: string, via?: string, click?: { fetch: string, method?: 'GET' | 'POST', body?: Readonly<Record<string, string>>, label: string } }

export interface OtherSite {
  /** The site's origin (`https://cheap-flour.example`): its page's, and its own server's (which answers anything with 200). */
  origin: string
  /** The page's path (default `/`). */
  path?: string
  /** The page's title. */
  title: string
  /** What the site is to the story: the panel names it so. */
  role: 'attacker' | 'mail' | 'other'
  /** The page's own lines above its actions (headings, the bait). */
  intro: readonly string[]
  actions: readonly SiteAction[]
  /** `<meta name="referrer" content="no-referrer">`: no Referer, and an `Origin: null` on a form's POST. */
  noReferrer?: boolean
  /**
   * A guard: the same page on a site no text names (so no server.js can single it out). It has no panel; only the check
   * runs visit it.
   */
  hidden?: boolean
}

const escape = (text: string) => text.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
const json = (value: unknown) => JSON.stringify(value).replace(/</g, '\\u003c')

/** The site's page as HTML: its intro, then each action as an attacker (or a mail) writes it. Read-only in the panel. */
export function sitePage(site: OtherSite): string {
  const body: string[] = []
  const scripts: string[] = []
  site.actions.forEach((action, index) => {
    if ('img' in action) body.push(`  <img src="${escape(action.img)}" alt="" width="1" height="1">`)
    else if ('frame' in action) {
      if (action.via) {
        body.push(`  <iframe src="${escape(action.via)}/" title="Saturday market" style="opacity: 0"></iframe>`)
        body.push(`  <!-- ${escape(action.via)}'s page frames ${escape(action.frame)} inside this frame -->`)
      } else if (action.over) {
        body.push(`  <button class="bait">${escape(action.over)}</button>`)
        body.push(`  <!-- the frame lies over the button, see-through: a click on the bait is a click on "${escape(action.click?.label ?? 'the page')}" -->`)
        body.push(`  <iframe src="${escape(action.frame)}" style="position: absolute; top: 0; left: 0; width: 100%; height: 100%; opacity: 0"></iframe>`)
      } else {
        body.push(`  <iframe src="${escape(action.frame)}" title="Corner Bakery" width="400" height="300"></iframe>`)
      }
    } else if ('link' in action) body.push(`  <p><a href="${escape(action.link)}">${escape(action.text)}</a></p>`)
    else if ('form' in action) {
      const id = `f${index + 1}`
      body.push(`  <form id="${id}" method="${action.method}" action="${escape(action.form)}">`)
      for (const [name, value] of Object.entries(action.fields)) body.push(`    <input type="hidden" name="${escape(name)}" value="${escape(value)}">`)
      body.push('  </form>')
      scripts.push(`  document.getElementById('${id}').submit()`)
    } else {
      const options: string[] = []
      if (action.method && action.method !== 'GET') options.push(`method: '${action.method}'`)
      if (action.credentials) options.push(`credentials: '${action.credentials}'`)
      if (action.mode) options.push(`mode: '${action.mode}'`)
      if (action.body) options.push(`body: new URLSearchParams(${json(action.body)})`)
      scripts.push(`  fetch('${action.fetch}'${options.length ? `, { ${options.join(', ')} }` : ''})`)
    }
  })
  return [
    '<!doctype html>',
    '<html lang="en">',
    '<head>',
    '  <meta charset="utf-8">',
    ...(site.noReferrer ? ['  <meta name="referrer" content="no-referrer">'] : []),
    `  <title>${escape(site.title)}</title>`,
    '</head>',
    '<body>',
    ...site.intro.map(line => `  ${line}`),
    ...body,
    ...(scripts.length ? ['  <script>', ...scripts, '  </script>'] : []),
    '</body>',
    '</html>',
    ''
  ].join('\n')
}

/** The address of the site's page. */
export const siteAddress = (site: OtherSite) => `${site.origin}${site.path ?? '/'}`
