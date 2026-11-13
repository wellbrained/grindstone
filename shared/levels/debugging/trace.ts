// Stack traces from the sealed frame, read in every browser's format and mapped back to the level's files
// (docs/features/levels.md, "The Debugging environment"). Modules run from blob URLs made inside the frame; the bridge
// tells the page which blob URL is which file. The frame's page itself is about:srcdoc: its lines are index.html's,
// except the one line that holds the bridge.
import type { SourceLine, TraceFrame } from './types'

/** A frame as the browser wrote it. */
export interface RawFrame {
  fn: string
  url: string
  line: number
  column: number | null
}

/** Which blob URL is which file, and the line of the page that holds the bridge (its frames are never shown). */
export interface SourceMapping {
  urls: Readonly<Record<string, string>>
  bridgeLine: number
}

/** The page of the frame (a srcdoc document) in every browser's traces. */
export const PAGE_URL = 'about:srcdoc'

// Chrome (V8): "    at fn (url:line:col)" or "    at url:line:col"; "async " and "new " can lead the name.
const CHROME = /^\s*at (?:(.+?) \()?(.+?):(\d+)(?::(\d+))?\)?\s*$/
// Firefox (Gecko) and Safari (WebKit): "fn@url:line:col", "@url:line:col". Firefox puts the cause of an async frame
// before a star: "async*fn@", "promise callback*fn@", "EventListener.handleEvent*@".
const GECKO = /^\s*(?:(.*?)@)?(.+?):(\d+)(?::(\d+))?\s*$/

const frameOf = (match: RegExpExecArray, fn: string): RawFrame => ({
  fn,
  url: match[2]!,
  line: Number(match[3]),
  column: match[4] === undefined ? null : Number(match[4])
})

/** The frames of an `Error.stack`, top first, in Chrome's, Firefox's or Safari's format; lines without a place are skipped. */
export function parseStack(stack: string): RawFrame[] {
  const lines = stack.split('\n')
  // V8 starts with the message, which can look like anything; once a line is a V8 frame, only V8 frames count
  if (lines.some(line => /^\s*at /.test(line) && CHROME.test(line))) {
    return lines.flatMap((line) => {
      const match = /^\s*at /.test(line) ? CHROME.exec(line) : null
      return match ? [frameOf(match, (match[1] ?? '').replace(/^async /, ''))] : []
    })
  }
  return lines.flatMap((line) => {
    // a Gecko/WebKit frame has an @ (anonymous ones start with it) or is a bare url:line:col
    if (!line.includes('@') && !/^\s*[a-z][\w+.-]*:\S*:\d+(?::\d+)?\s*$/i.test(line)) return []
    const match = GECKO.exec(line)
    if (!match || /^\[native code\]$/.test(match[2]!)) return []
    return [frameOf(match, (match[1] ?? '').replace(/^.*\*/, ''))]
  })
}

/** The file and line of a place in the frame; null for anything that is not one of the level's files (or the bridge). */
export function sourceOf(url: string | null, line: number | null, mapping: SourceMapping): SourceLine | null {
  if (url === null || line === null) return null
  if (url === PAGE_URL) return line === mapping.bridgeLine ? null : { path: 'index.html', line }
  const path = mapping.urls[url]
  return path ? { path, line } : null
}

/** The frames that are the level's own code, top first; the bridge, the browser and eval'd Console input are dropped. */
export function mapFrames(frames: readonly RawFrame[], mapping: SourceMapping): TraceFrame[] {
  return frames.flatMap((frame) => {
    const source = sourceOf(frame.url, frame.line, mapping)
    return source ? [{ fn: frame.fn || '(anonymous)', path: source.path, line: source.line, column: frame.column }] : []
  })
}
