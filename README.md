# 2code

2code's workstation as a layout for [Herdr](https://herdr.dev). Herdr runs
the terminals and agents; 2code adds the look and the workflow.

![2code for Herdr](preview.png)

> The original Tauri desktop app lives on the
> [`legacy-tauri-app`](https://github.com/AkaraChen/2code/tree/legacy-tauri-app)
> branch and is no longer developed.

## Install

Install [Herdr](https://herdr.dev/download/), then ask the agent in any Herdr
terminal:

```
Add the Herdr layout at github.com/AkaraChen/2code
```

Or from a clone:

```sh
./scripts/install.sh                         # copies into ~/.config/herdr-app and runs herdr-app check
herdr-app do layout.switch --name 2code
```

`ctrl-shift-l` cycles layouts, so Herdr's own stays one key away.

## Features

- **Projects and worktrees** in the sidebar, from `git worktree list`; a
  folder of repos shows as a group, Herdr's agent list sits below.
- **New worktree** (`+`) runs the project's `setup_script`; **delete** (`×`)
  warns about uncommitted or unpushed work, runs `teardown_script` and keeps the branch.
- **Project settings** (gear) edit `2code.json` scripts and templates.
- **Terminal tabs**: "+ New" opens Herdr's menu (terminal or agent); the
  chevron opens terminal templates.
- **Files**: tree with icons, git colors and a right-click menu; files open as
  editor tabs (save, reload on disk changes, markdown preview, images).
- **Changes**: commit only the checked files, discard, push.
- **Diff dialog**: changes and history, unified or split, review comments
  copied for an agent in one go.
- **Top bar**: branch switcher, pull request state (`gh`), "Open in…" your
  editor, terminal or GitHub Desktop.
- **English or 简体中文** from `LC_ALL` / `LC_MESSAGES` / `LANG`; light and
  dark themes (`2code-light`, `2code-dark`).

Terminals, agent status, settings and remote machines are Herdr's.

## Keys

Active in the 2code layout (`keys.json` section `layout:2code`). `install.sh`
adds them to your `keys.json` without replacing keys you set; Herdr then stops
updating its defaults in that file. Herdr's keys keep working (`cmd-w`,
`cmd-b`, `cmd-,`, `cmd-f`).

| macOS | Linux / Windows | |
|---|---|---|
| `cmd-t` | `ctrl-shift-t` | new terminal (runs `init_script`) |
| `cmd-k` | `ctrl-shift-k` | find a file |
| `cmd-s` | `ctrl-s` | save (in a file tab) |
| `cmd-g` | `ctrl-shift-g` | diff dialog |
| `cmd-e` | `ctrl-shift-e` | toggle the Files / Changes panel |
| `cmd-shift-e` | `ctrl-shift-j` | arrow keys in the sidebar (Esc returns) |
| `shift-enter` | `shift-enter` | newline (agent prompts) |
| `alt-left` / `alt-right` | `alt-left` / `alt-right` | word left / right |

On Linux and Windows plain `ctrl-` letters stay with terminal programs, hence
the `ctrl-shift-` keys.

## `2code.json`

At a project's root (main checkout; worktrees use it too):

```json
{
  "setup_script": ["bun install"],
  "teardown_script": ["rm -rf node_modules"],
  "init_script": ["nvm use"],
  "terminal_templates": [
    { "name": "Dev server", "cwd": "apps/web", "commands": ["bun dev"] }
  ]
}
```

- `setup_script` / `teardown_script`: each line runs with `sh -c` in the
  worktree, stopping at the first failure.
- `init_script`: typed into terminals from the new-terminal key and templates,
  before a template's commands.
- `cwd`: relative to the worktree root; empty means the root.

Global templates go in `~/2code/2code.json` (same `terminal_templates` shape).

## Repository

| Path | What |
|---|---|
| `layouts/2code.json`, `mods/2code/`, `themes/` | layout, mod, themes |
| `keys.json` | layout keys, merged by `install.sh` |
| `RECIPE.md` | how it works, to rebuild it (Herdr's sharing format) |
| `TODO.md` | differences from the Tauri app (中文) |
| `scripts/install.sh` | copy into a Herdr home and check |
| `scripts/build-file-icons.mjs` | rebuild file icons from material-icon-theme |
