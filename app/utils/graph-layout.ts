// Lane layout for the commit graph: a pure function from repo data to rows, lanes and edges (docs/features/ui.md).
// No Vue, no DOM, no geometry in pixels: CommitGraph.vue turns rows and lanes into coordinates.

export interface LayoutCommit {
  id: string
  parents: string[]
  message: string
  /** Orders commits in time (the model's logical clock); parents always come after their children. */
  timestamp: number
}

export interface LayoutInput {
  commits: Record<string, LayoutCommit>
  /** Local branches. */
  branches: Record<string, string>
  /** Remote-tracking refs, keyed by the branch name on origin (drawn as `origin/<name>`). */
  remoteBranches: Record<string, string>
  head: { type: 'branch', name: string } | { type: 'detached', commit: string }
  /** Tags: name -> commit. Optional; a tag gets a label but never a lane or a colour of its own. */
  tags?: Record<string, string>
  /** The remote's own state; only passed when the "show origin" toggle is on. Unfetched commits and branch heads appear. */
  origin?: { commits: Record<string, LayoutCommit>, branches: Record<string, string> } | null
}

/** `local`: a branch (filled pill). `remote`: a remote-tracking ref (outlined). `origin`: the remote's real branch head (dashed). `head`: a detached HEAD. `tag`: a tag (neutral). */
export type LabelKind = 'local' | 'remote' | 'origin' | 'head' | 'tag'

export interface GraphLabel {
  /** What the pill says: `main`, `origin/main`, `origin: main`, `HEAD`, `tag: v1.4.0`. */
  name: string
  kind: LabelKind
  /** The branch name the colour comes from (see branch-palette.ts). */
  branch: string
  /** The pill of the checked-out branch (drawn as `HEAD -> main`), or the detached HEAD itself. */
  head: boolean
}

export interface GraphNode {
  id: string
  shortId: string
  /** First line of the message. */
  message: string
  row: number
  lane: number
  /** Colour source: the branch line this commit belongs to. */
  branch: string
  labels: GraphLabel[]
}

export interface GraphEdge {
  /** `<child>><parent>`: stable across renders. */
  id: string
  from: string
  to: string
  fromRow: number
  fromLane: number
  toRow: number
  toLane: number
  /** True for the second and later parents of a merge commit (the merged-in line). */
  merge: boolean
  branch: string
}

export interface GraphLayout {
  nodes: GraphNode[]
  edges: GraphEdge[]
  laneCount: number
  rowCount: number
}

interface Ref {
  /** Lane owner key, unique per ref. */
  key: string
  label: GraphLabel
  tip: string
}

export const shortCommitId = (id: string) => id.slice(0, 7)

const firstLine = (message: string) => message.split('\n', 1)[0] ?? ''

/** Every ref in claiming order: main, the checked-out branch, other branches, detached HEAD, origin/*, origin's own heads. */
function collectRefs(input: LayoutInput, commits: Record<string, LayoutCommit>): Ref[] {
  const current = input.head.type === 'branch' ? input.head.name : null
  const localNames = Object.keys(input.branches).sort((a, b) => {
    const rank = (name: string) => name === 'main' ? 0 : name === current ? 1 : 2
    return rank(a) - rank(b) || a.localeCompare(b)
  })
  const refs: Ref[] = localNames.map(name => ({
    key: name,
    tip: input.branches[name]!,
    label: { name, kind: 'local', branch: name, head: name === current }
  }))
  if (input.head.type === 'detached') {
    refs.push({ key: 'HEAD', tip: input.head.commit, label: { name: 'HEAD', kind: 'head', branch: 'HEAD', head: true } })
  }
  const remoteNames = Object.keys(input.remoteBranches).sort((a, b) => Number(b === 'main') - Number(a === 'main') || a.localeCompare(b))
  for (const name of remoteNames) {
    refs.push({ key: `origin/${name}`, tip: input.remoteBranches[name]!, label: { name: `origin/${name}`, kind: 'remote', branch: name, head: false } })
  }
  if (input.origin) {
    const liveNames = Object.keys(input.origin.branches).sort((a, b) => Number(b === 'main') - Number(a === 'main') || a.localeCompare(b))
    for (const name of liveNames) {
      const tip = input.origin.branches[name]!
      // The tracking ref already shows an origin branch that was fetched: only draw heads you have not seen.
      if (input.remoteBranches[name] === tip) continue
      refs.push({ key: `origin:${name}`, tip, label: { name: `origin: ${name}`, kind: 'origin', branch: name, head: false } })
    }
  }
  return refs.filter(ref => commits[ref.tip])
}

/** Commits from the tips back through every parent. Anything an old branch left behind (orphaned by a rebase) is not reachable and is not drawn. */
function reachable(commits: Record<string, LayoutCommit>, tips: string[]): Set<string> {
  const seen = new Set<string>()
  const stack = [...tips]
  while (stack.length) {
    const id = stack.pop()!
    if (seen.has(id) || !commits[id]) continue
    seen.add(id)
    stack.push(...commits[id]!.parents)
  }
  return seen
}

/** Newest first, children always before their parents (Kahn's algorithm, the newest ready commit next). */
function topoOrder(commits: Record<string, LayoutCommit>, ids: Set<string>): string[] {
  const pendingChildren = new Map<string, number>([...ids].map(id => [id, 0]))
  for (const id of ids) {
    for (const parent of new Set(commits[id]!.parents)) {
      if (ids.has(parent)) pendingChildren.set(parent, pendingChildren.get(parent)! + 1)
    }
  }
  const ready = [...ids].filter(id => pendingChildren.get(id) === 0)
  const order: string[] = []
  while (ready.length) {
    let best = 0
    for (let i = 1; i < ready.length; i++) {
      const a = commits[ready[i]!]!
      const b = commits[ready[best]!]!
      if (a.timestamp > b.timestamp || (a.timestamp === b.timestamp && a.id < b.id)) best = i
    }
    const [id] = ready.splice(best, 1)
    order.push(id!)
    for (const parent of new Set(commits[id!]!.parents)) {
      if (!ids.has(parent)) continue
      const left = pendingChildren.get(parent)! - 1
      pendingChildren.set(parent, left)
      if (left === 0) ready.push(parent)
    }
  }
  return order
}

export function layoutGraph(input: LayoutInput): GraphLayout {
  const commits: Record<string, LayoutCommit> = { ...input.origin?.commits, ...input.commits }
  const refs = collectRefs(input, commits)
  // tags keep their commits in the graph (like `git log --all`) and get a label, but claim no lane
  const tags = Object.keys(input.tags ?? {}).sort().map(name => ({ name, tip: input.tags![name]! })).filter(tag => commits[tag.tip])
  const ids = reachable(commits, [...refs.map(ref => ref.tip), ...tags.map(tag => tag.tip)])
  const order = topoOrder(commits, ids)

  // A branch line is the first-parent chain from a ref's tip, down to the first commit another ref already claimed.
  const owner = new Map<string, string>()
  const colour = new Map<string, string>()
  const ownerOrder: string[] = []
  const claim = (key: string, branch: string, tip: string) => {
    for (let id: string | undefined = tip; id && ids.has(id) && !owner.has(id); id = commits[id]!.parents[0]) {
      owner.set(id, key)
      if (!colour.has(key)) {
        colour.set(key, branch)
        ownerOrder.push(key)
      }
    }
  }
  for (const ref of refs) claim(ref.key, ref.label.branch, ref.tip)
  // Lines nobody points at any more (a merged branch that was deleted): own lane, own colour.
  for (const id of order) {
    if (!owner.has(id)) claim(`line:${id}`, `line:${shortCommitId(id)}`, id)
  }

  const laneOf = new Map(ownerOrder.map((key, lane) => [key, lane]))
  const row = new Map(order.map((id, index) => [id, index]))

  const labelsFor = new Map<string, GraphLabel[]>()
  for (const ref of refs) labelsFor.set(ref.tip, [...labelsFor.get(ref.tip) ?? [], ref.label])
  for (const tag of tags) {
    labelsFor.set(tag.tip, [...labelsFor.get(tag.tip) ?? [], { name: `tag: ${tag.name}`, kind: 'tag', branch: tag.name, head: false }])
  }

  const nodes: GraphNode[] = order.map((id) => {
    const commit = commits[id]!
    const key = owner.get(id)!
    return {
      id,
      shortId: shortCommitId(id),
      message: firstLine(commit.message),
      row: row.get(id)!,
      lane: laneOf.get(key)!,
      branch: colour.get(key)!,
      labels: labelsFor.get(id) ?? []
    }
  })
  const byId = new Map(nodes.map(node => [node.id, node]))

  const edges: GraphEdge[] = []
  for (const node of nodes) {
    commits[node.id]!.parents.forEach((parentId, index) => {
      const parent = byId.get(parentId)
      if (!parent) return
      edges.push({
        id: `${node.id}>${parentId}`,
        from: node.id,
        to: parentId,
        fromRow: node.row,
        fromLane: node.lane,
        toRow: parent.row,
        toLane: parent.lane,
        merge: index > 0,
        // a merged-in line keeps its own colour; a line that forks off takes the colour of the new branch
        branch: index > 0 ? parent.branch : node.branch
      })
    })
  }

  return { nodes, edges, laneCount: ownerOrder.length, rowCount: nodes.length }
}
