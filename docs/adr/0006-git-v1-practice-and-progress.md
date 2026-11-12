# 0006 · Git v1: more levels, practice tasks, redo and reset

Status: accepted, 2026-11-12 (Nik, grilling + previews).

## Scope

- **Git v1**: about 30 entries filling chapters 1–6, shipped one chapter at a time; each chapter goes live when it is done. Disasters, Workflows, interactive rebase (squash) and `reflog` come in later batches.
- **First batch**: chapter 1 Basics + the practice-task format + redo/reset/backup. Then Undo & recovery (with `reset`, `revert`, `stash`), and so on.
- Per chapter, the owner first sees a preview (level list + one sample) before it is built.

## Two kinds of exercise

- **Scenario**: a story, goals, up to three hints, a debrief (as before). Numbered `chapter.position` (1.1, 1.2 …).
- **Practice task** (called "Practice" in the UI, not "drill"): one short task of 1–3 commands, no story, ~30 s, one goal, one hint, "Next" and "Again". It belongs to the scenario it trains and sits right after it.
- Every entry has a **difficulty** (1–3) and an **estimated time**.

## How practice tasks are shown (preview G2)

- The chapter's lane is the main line; a scenario is a commit dot on it. Its practice tasks are smaller commits on a short **side branch** that forks off the scenario (like `git log --graph`).
- Practice tasks carry **no number**; the branch shows where they belong. Indent is small. Filled = solved, hollow = open.

## Writing levels

- Instructions are precise and clear: compact, but never leave out information the learner needs.
- Code comments and file contents in levels read like a real project with other people working on it.
- Tone: friendly and personal. We are their friends who want to help and teach them.
- `.gitignore` is supported by the git simulation (it is part of git and important).

## Redo, "practise again", reset, backup

- Replaying a solved entry never costs anything: it stays solved; the row and debrief show the **best run** (fewest commands, fewest hints) next to the latest.
- **Practise again**: a flag on a solved entry ("solved, but I don't own it yet"); Continue offers flagged entries once nothing new is left. Solving a flagged entry again clears the flag (decided after batch 1).
- **Reset**: per entry ("Mark as not solved", in its ⋯ menu), per chapter and per track (⋯ menus on the track page), everything (About page, "Your progress"). Every reset asks for confirmation and clears solved, best run, practise-again flag and last played for its scope.
- **Backup**: "Download progress" / "Load progress" (JSON) on the About page.

## Cheat sheet (same day)

Cards follow preview B6: the heading is a prompt (`$ git rebase`), examples sit in a small terminal as `# comment` above `$ command`, click to copy. Only the heading's `$` is ember; rail, command prompts and links are neutral.

## Finishing Git v1 (2026-11-12, owner: "finish all the git practices per your recommendation")

The owner approved chapters 6, 2 and 3 from previews, then the chapter 4 preview (`.impeccable/mocks/previews/rewriting-preview.html`, with interactive rebase pulled forward from "later" and the todo list and commit messages opening in the editor pane), and delegated the rest to this plan. Built one chapter at a time, each deployed when done.

- **4 Rewriting history**: 4.1 Put your branch on top of main (existing Rebase, retitled) · 4.2 Conflict during a rebase · 4.3 Push a rebased branch (`--force-with-lease`) · 4.4 Tidy up before review (`rebase -i`). Practice: rebase onto main, give up a rebase, push a rewritten branch safely, fix an old commit message.
- **5 Teamwork & remotes**: 5.1 Push your first branch (`push -u`) · 5.2 Get your teammates' work (fetch vs pull) · 5.3 Your push was rejected (`pull --rebase`, push) · 5.4 Ahead and behind (`status`, `log origin/main..main`) · 5.5 Teammate sync (existing, the hardest). Practice: push a new branch with upstream, fetch without touching your branch, pull with rebase, see what you haven't pushed, prune branches gone from origin.
- **7 Disasters** (needs `reflog`, `rm --cached`): 7.1 Committed on main by mistake · 7.2 Lost commits after `reset --hard` (reflog) · 7.3 Rebased the wrong branch · 7.4 Committed a secret (not pushed; untrack it, ignore it, rewrite the commit, rotate the key) · 7.5 Deleted a branch with unmerged work. One or two practice tasks each.
- **8 Workflows** (needs `cherry-pick`, `tag`): 8.1 The pull request flow · 8.2 Hotfix in the middle of a feature · 8.3 Bring a fix to the release branch (`cherry-pick`) · 8.4 Tag a release · 8.5 A release branch, GitFlow style. One or two practice tasks each.
