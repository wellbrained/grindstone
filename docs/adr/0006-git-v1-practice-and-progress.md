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
