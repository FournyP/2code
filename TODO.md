# TODO：herdr 版 2code 与旧版（Tauri）的差距

旧版在 [`legacy-tauri-app`](https://github.com/AkaraChen/2code/tree/legacy-tauri-app) 分支，功能已迁移完或确认砍掉。已有功能见 [README](README.md)，实现见 [RECIPE](RECIPE.md)。

## 一、仓库所有者

- [ ] （可选）在 GitHub Releases 发迁移公告。旧版自动更新读 “latest” release 的 `latest.json`，新 release 不要标 latest。
- 没有 LICENSE（作者惯例）；要让别人合法复用需补一个。第三方代码已在 `mods/2code/NOTICE` 注明：Herdr mod（Apache-2.0）、Lucide（ISC）、material-icon-theme（MIT）。

## 二、受 Herdr 限制

- agent 状态：只认 agent 自己发的 OSC 7501，不上报的没有状态点（旧版的屏幕文字识别用不上）。
- 终端链接由 Herdr 用系统默认程序打开；mod 拿不到点击事件，不能选浏览器，也不能在编辑器打开 `路径:行:列`。
- ⌘= / ⌘- 是整体缩放，不能只缩放终端。
- 没有 WebView：不能预览 PDF、Office、压缩包。
- Herdr 编辑器：文件最大 1 MiB；无查找替换、跳转到行、LSP；TypeScript 按 JS 高亮。
- 未保存提示只拦 2code tab 上的 ×；⌘W、菜单关闭不提示，改动存为恢复副本。
- Herdr 自己的界面（设置、worktree 对话框、toast）只有英文。
- Diff 点击不带修饰键，所以用“点一行再点另一行”选范围。
- 没有回收站的挂载点（如 `/tmp`）：对话框说明原因并提供“永久删除”。
- Herdr 只发布 Apple Silicon 版，Intel Mac 需自行编译。
- layout 不自动更新，需重新安装。

## 三、与旧版不同（已接受）

- 新建 worktree：没有拼音分支名和自动起名（`pr/<city>-xxxx`）；固定在 `~/.herdr/worktrees/<仓库>/<分支>`，`worktree_dir` 不生效。
- 删除 worktree：保留分支；从 Herdr 菜单删除不执行 `teardown_script`。
- `init_script` 只在模板和 ⌘T / Ctrl+Shift+T 时执行；“+ New” 等其他方式开的终端不执行。
- 关掉 worktree 的最后一个 tab 会关闭其 space，侧栏显示为“未打开”。
- 没有首页和首次使用引导。
- 顶栏按钮不能排序或隐藏，改为“用…打开”菜单。
- 设置用 Herdr 设置页（字体、主题、提示音、默认 shell）；语言只跟随 `LC_ALL` / `LC_MESSAGES` / `LANG`。
- 快捷键：Linux / Windows 上 Ctrl+K / G / E 改为 Ctrl+Shift；在 2code layout 中 Ctrl+Shift+E 覆盖 Herdr 向下分屏，Ctrl+Shift+K 覆盖 picker；Linux 上 Alt+←/→ 覆盖 pane 切换；安装会改 `keys.json`，之后 Herdr 不再更新其默认快捷键。
- 全局配置在 `~/2code/2code.json`（非隐藏目录）。

## 四、待验证

已验证：Linux + Xvfb、中文环境（`LANG=zh_CN.UTF-8`）、`2code-dark`、macOS 红绿灯位置（#499）。

- [ ] macOS 真机：在 Finder 中显示、默认应用打开、`/usr/bin/trash`；“用…打开”能否找到 `/Applications` 下的应用；登录 shell 无 `LANG` 时回退英文。
- [ ] 真机上 Shift 扩选。
- [ ] Windows：setup、teardown、模板依赖 `sh`；显示走 `explorer.exe`，回收站走 PowerShell。
- [ ] 远程机器上的项目：新建/删除 worktree、模板（`hc send`）、Changes 和 Diff、远程文件只读打开、项目设置只读。
