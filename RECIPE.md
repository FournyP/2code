# 2code

How the 2code layout looks and works, to rebuild or change it. Exact sizes
and colors live in the code.

![2code](preview.png)

## What you see

- **Sidebar** (250px, min 44, max 420, `chrome`):
  - 52px header, drags the window: Herdr's mark + "Herdr" in a clipped slot,
    sidebar toggle. macOS (not fullscreen): starts at 76px, clear of
    `traffic_lights: [16, 19]`.
  - "Projects" + `+` (folder picker). Project row: GitHub avatar (else letter
    tile), name, most urgent agent dot (only while folded), caret. Worktree
    rows under it: branch icon, branch (main checkout first), dot slot under
    the caret; `dim` without an open space.
  - Group: a non-repo folder holding repos one level down nests them.
  - Herdr's `agents` list below; footer: Settings. Under 160px: tiles only.
- **Top bar** (52px; on macOS with the sidebar hidden or too narrow, pads to
  `traffic_lights.x + 64`): Files / Changes switch (Changes shows green `+N` /
  red `-N`), centered project (hover: path) and branch, PR chip
  (`#12 Open|Draft|Merged|Closed`), "Open in…", gear (project settings).
- **Side panel** (260px, hidden until picked), stack of `files` / `changes`:
  - Files: material icons, git colors (`ansi2` new, `ansi4` modified, `ansi1`
    deleted), dot on folders with changes, gitignored at 50% opacity.
  - Changes: select-all, file rows (checkbox, name, folder or `← old`, undo on
    hover, status badge), picked file's diff, commit box (Summary,
    Description, Push N when ahead, Commit).
- **Terminal area**: one strip of terminal and file tabs (underline on active,
  icon, title, agent dot, unsaved dot, ×), "+ New" (Herdr's `new-menu`:
  terminal or installed agent), templates chevron; panes with 1px borders, no
  gaps, no rounding.
- **File tab**: header (path, unsaved dot, Edit / Split / Preview for
  markdown, "Read-only" on other machines, Save), banner when needed, Herdr's
  Editor, markdown split or image with its size.
- **Diff dialog** (92% × 88%): Changes / History, "Review (N)", Unified /
  Split. Left: changes, or commits then a commit's files. Right: unified or
  split diff, or images before / after; comment bar on selection.

## How it behaves

- **Brand**: hovering the header rolls Herdr's row up and out, 2code's
  (`mods/2code/icons/2code.png`) in from below; leaving reverses. Native
  `transition` on `top` and `opacity`.
- **Agent dots**: `working` `#34d399` pulsing, `blocked` `#facc15`, `done`
  `#22c55e`, `idle` none.
- **Projects**: shared `2code.projects` (`[{path, machine, name?}]`). Every 4s
  the sidebar adds each open space's repo (main checkout via
  `git rev-parse --git-common-dir`) and reads `git worktree list --porcelain`.
  Name from folder ("app.git" → "app", "bare.git" → parent) unless renamed.
- **Clicks**: project selects its shown, else first open, else main worktree;
  worktree selects its space, else `space.new {folder}`. `+` opens Herdr's
  `worktree` dialog (action `new`, main checkout); a `setup_script` runs as
  the new space's first tab ("setup" / "安装"). `×` on a non-main worktree:
  Delete worktree.
- **Context menus**: project: New Worktree, Rename, Project Settings, Reveal,
  Remove Project (closes its spaces). Worktree: Open, Reveal, Delete.
- **Delete worktree**: shows uncommitted files, unpushed commits, teardown
  lines; Run teardown and delete / Skip teardown / Cancel; closes the space,
  `git worktree remove [--force]`. Branch stays.
- **Project settings**: Scripts, Project Templates, Global Templates. Save
  writes `<main>/2code.json` and `~/2code/2code.json`, keeps unknown fields,
  never creates an empty file.
- **Files menu**: Open, Open in Default App, Reveal, New File / Folder,
  Rename, Copy Relative / Absolute Path, Refresh, Delete (trash via
  `/usr/bin/trash`, `gio trash` or PowerShell; if refused, the dialog says why
  and offers Delete Permanently; never `rm` as a fallback).
- **File tabs**: a Herdr tab whose only pane is the `editor` part
  (`tab.new {mod, props: {part, path, on, root}}`); `2code.editors` maps tab
  ids to files, `2code.dirty` marks unsaved. Save (section `mod:2code`) uses
  `writeTextFile(path, text, savedSnapshot)`; a rejected snapshot offers
  Reload / Overwrite. Reread every 3s: silent if clean, else Keep Mine /
  Reload. Unsaved text is copied to `mods/2code/.cache/recovery/`; reopening
  offers Restore / Discard. × on unsaved asks Save / Don't Save / Cancel
  (answered via `2code.editorRequest`).
  Find (`2code.findInFile`) and Go to line (`2code.goToLine`) open a bar and
  select via `EditorState.set_selected_range` (only the focused tab's editor
  answers); the editor's minimal scroll stops short at the bottom, so the
  cursor first goes 8 lines below, then a frame later to the match. Markdown
  preview links: `http(s)` / `mailto` to the browser, anything else resolved
  against the file's folder and opened in a tab.
- **Finder**: fuzzy search over `git ls-files --cached --others
  --exclude-standard` (else `find`).
- **Changes**: Commit runs `git add -A -- <checked>` then `git commit -m
  summary [-m description] -- <checked>`. Undo needs two clicks: `git restore
  --source=HEAD --staged --worktree` (`git clean -f` for new files). Push:
  `git push` (`-u origin HEAD` without upstream). A group folder lists its
  repos first; click one to commit there.
- **Review**: click a diff line, then another for a range (shift-click too);
  comments go to `2code.review[root]`. Copy for Agent writes "Please address
  these review comments:" with each `file:range`, diff and comment.
- **Branch switcher**: current, trunk (`origin/HEAD`), "used" by another
  worktree, ↑/↓ counts, remote-only; `git switch` (`--track` for remote).
- **Tabs**: right-click is Herdr's tab menu (file tabs: copy paths, Reveal,
  Open in Default App). "+ New" skips `init_script`; the new-terminal key
  types it. A template opens a tab named after it in its `cwd` and types
  `init_script` then `commands`.
- **Keys**: README "Keys". Sidebar keyboard: ↑↓, → open, ← close / parent,
  Enter, Esc back to the terminal.
- **Language**: `sh -c 'printf %s "${LC_ALL:-${LC_MESSAGES:-$LANG}}"'`
  (`$env:` in PowerShell); `zh*` → 简体中文, else English.

## Built from

- `layouts/2code.json`: root `row` (`titlebar: none`, theme
  `{light: 2code-light, dark: 2code-dark}`, JetBrains Mono 13) → `sidebar`
  (`brand`, `sidebar-lists` [`projects`, `agents`], `sidebar-footer`) and
  `work` (`topbar`, `work-body` → `panel` stack [`files`, `changes`] and
  `terminal-area` [`tabs`, `main` tab block]).
- Blocks but `agents` are `{mod: "2code", props: {part}}`. Parts: `header`,
  `sidebar`, `footer`, `topbar`, `tabs`, `files`, `changes`, `editor`; popups
  `menu`, `templates`, `openIn`, `fileMenu`; dialogs `rename`,
  `removeProject`, `deleteProfile`, `projectSettings`, `diff`, `review`,
  `branches`, `finder`, `filePrompt`, `fileDelete`, `unsaved`.
- Shipped mods: `worktree`, `menu`, `agents`, `new-menu`. File icons: 209 from
  material-icon-theme (MIT).
- `herdr`: `spaces`, `panes`, `focused`, `layout`, `theme`, `settings`,
  `window`, `shared` / `setShared`, `exec`, `hc` (`send`), `readTextFile`,
  `writeTextFile`, `watchFolder`, `pickFolder`, `openOverlay` /
  `closeOverlay`, `notify`, `nextCommand`, `appHome`, `run`; `fs/promises`;
  `cx.open_url`, `cx.write_to_clipboard`.
- Programs: `git`, `gh`, `sh`, `curl`, `open` / `xdg-open` / `explorer.exe`.

## Watch out

- Herdr refuses imports from another mod's folder: one mod, parts by
  `props.part`.
- `tab.new {task}` only types into agents: templates find the new terminal in
  `panes()` (poll `cx.sleep(100)`, up to 6s) and type with `hc send`.
- A popup's tasks end when it closes: menus run their action, then close.
- Herdr's Remove worktree needs an open space (else closes the focused one):
  Delete worktree removes it itself.
- Virtual list rows can't take `on_click`: use `on_item_click(key)`. No
  modifiers, hence click-then-click ranges.
- Deeply nested flex gives `size_full()` children no height: use
  `absolute().inset_0()` in a `relative()` box.
- `image()` reads only the app folder, no fit: copy into `mods/2code/.cache/`,
  size from headers.
- `h_flex` centers children: a box of only absolute children needs `h_full()`.
- Inputs keep their creation placeholder: remake them (keeping text) when
  `2code.locale` resolves.
- `spring` on `top` didn't move: use `transition`.
- Herdr closes tabs without asking a mod: only 2code's × can prompt, hence the
  recovery copy.
- `gio trash` refuses some mounts (e.g. `/tmp`): never silently delete instead.
- `fetch()` is text-only: avatars download with `curl`.
- No `Intl` or `navigator`. Herdr's own dialogs stay English.
- Plain `ctrl-` letters belong to terminal programs on Linux and Windows.

## Done when

- `herdr-app check mods/2code` passes; `layout.switch {name: "2code"}` leaves
  no `herdr-app status` errors.
- A project with no tabs stays; its worktree reopens a space. Two worktrees
  of a repo sit under one project; spaces on one checkout share a row.
- `+` runs `setup_script`; `×` runs `teardown_script` and removes the worktree.
- Saved templates appear in the menu and run in a named tab.
- Unchecked files stay uncommitted; a two-line comment gives "Review (1)".
- New terminal key runs `init_script`; outside file changes show within 3s.
- `LANG=zh_CN.UTF-8`: all 2code labels Chinese; unset: English.
