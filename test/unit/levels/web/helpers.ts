// Runs a level's server.js on Node the way the worker in the sealed frame does (the same runtime source, server.js with
// `require` and `express` in reach, its console captured), and the web backend around it with that server in place of
// the worker. The frame's own host (the worker, the watchdog) is tested in a browser: e2e/web-levels.spec.ts.
import { STATUS_TEXT } from '../../../../shared/levels/debugging/backend'
import { SERVER_LIMITS, SERVER_RUNTIME_SOURCE } from '../../../../shared/levels/web/server'
import type { ServerAnswer, ServerOutput, ServerRequest, ServerRuntime } from '../../../../shared/levels/web/server'
import { WEB_BACKEND_SOURCE, webConfig } from '../../../../shared/levels/web/backend'
import type { WebRuntime, WebSpec } from '../../../../shared/levels/web/backend'
import { SHOP_ORIGIN } from '../../../../shared/levels/debugging/sandbox'

const createRuntime = new Function(`return ${SERVER_RUNTIME_SOURCE}`)() as (limits: unknown, emit: (line: ServerOutput) => void) => ServerRuntime

export interface NodeServer {
  /** Answers one request (or rejects when server.js crashed while it started). */
  handle: (request: ServerRequest) => Promise<ServerAnswer>
  /** What server.js wrote: access lines, its console, errors. */
  output: ServerOutput[]
  /** Why it did not start (it threw at its top level, or does not parse), or null. */
  crashed: string | null
  /** The handler for the web backend's `serve` hook (a crashed server refuses the connection). */
  serve: (request: ServerRequest, done: (answer: ServerAnswer | { fail: string }) => void) => void
}

export function nodeServer(source: string): NodeServer {
  const output: ServerOutput[] = []
  const runtime = createRuntime({ ...SERVER_LIMITS, statusText: STATUS_TEXT }, line => output.push(line))
  const log = (level: ServerOutput['level']) => (...args: unknown[]) => output.push({ level, text: args.map(arg => typeof arg === 'string' ? arg : JSON.stringify(arg)).join(' '), line: null })
  const console = { log: log('log'), info: log('log'), warn: log('warn'), error: log('error') }
  const require = (name: string) => {
    if (name === 'express') return runtime.express
    throw new Error(`Cannot find module '${name}'`)
  }
  let crashed: string | null = null
  try {
    new Function('require', 'console', source)(require, console)
  } catch (error) {
    crashed = error instanceof Error ? `${error.name}: ${error.message}` : String(error)
  }
  const handle = (request: ServerRequest) => new Promise<ServerAnswer>((resolve, reject) => {
    if (crashed) reject(new Error(crashed))
    else runtime.handle(request, resolve)
  })
  const serve: NodeServer['serve'] = (request, done) => {
    if (crashed) setTimeout(() => done({ fail: 'net::ERR_CONNECTION_REFUSED' }), 0)
    else runtime.handle(request, done)
  }
  return { handle, output, crashed, serve }
}

type Posted = Record<string, unknown> & { type: string }

const createBackend = new Function(`return ${WEB_BACKEND_SOURCE}`)() as (config: unknown, hooks: unknown) => WebRuntime

/** The web backend on Node with the level's server.js run in-process: what it posts, and the runtime. */
export function nodeBackend(spec: WebSpec, files: Readonly<Record<string, string>>) {
  const posted: Posted[] = []
  const server = nodeServer(spec.server ? files[spec.server] ?? '' : '')
  const config = webConfig(spec, files, SHOP_ORIGIN)
  const backend = createBackend(config, {
    post: (message: Posted) => posted.push(message),
    now: () => Date.now(),
    serve: config.source === null ? (_request: ServerRequest, done: (answer: { fail: string }) => void) => setTimeout(() => done({ fail: 'net::ERR_CONNECTION_REFUSED' }), 0) : (request: ServerRequest, done: (answer: ServerAnswer | { fail: string }) => void) => server.serve(request, done)
  })
  const of = (type: string) => posted.filter(message => message.type === type)
  return { backend, posted, of, server }
}
