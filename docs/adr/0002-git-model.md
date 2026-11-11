# 0002 · Own git model instead of real git

Status: accepted, 2026-11-11.

## Decision

Git is simulated in pure TypeScript: commits, trees/blobs as plain data, refs, HEAD, index, working tree, and a second repository `origin` with `origin/*` tracking refs on the local side. A command is a function `(state, args) => { state, output }`; state is immutable data, so `undo` and Reset are a stack of earlier states.

Output follows real git's wording for the supported commands and flags (`status`, `log --oneline --graph`, conflict messages, "rejected, fetch first"). Unknown commands or flags answer that they are not in the trainer yet.

## Why

- isomorphic-git has no `rebase`; its `merge` does not update the working tree on a clean merge; its new `cherryPick` overwrote local changes (isomorphic-git #2436). The rebase and sync levels are the point of the product.
- Deterministic: every level and every solution can be replayed in Vitest.
- Teammates are just events that change `origin`; goals are plain functions over the state.
- Undo is nearly free.

## Cost

Not real git: edge cases must be modelled by hand. Kept small by supporting a fixed command list and saying so for everything else.
