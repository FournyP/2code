// "Open in…" from the top bar: the editors, terminals and GitHub Desktop this
// computer has, as 2code's top bar offered them. macOS finds apps in
// /Applications; elsewhere by their command on PATH.
import { div } from "gpui-kit";
import { theme, exec, window } from "herdr";
import { t } from "../lib/i18n.js";
import { menu, runThenClose } from "../lib/ui.js";

const APPS = [
  { name: "VS Code", mac: "Visual Studio Code", cmd: "code" },
  { name: "Cursor", mac: "Cursor", cmd: "cursor" },
  { name: "Windsurf", mac: "Windsurf", cmd: "windsurf" },
  { name: "Zed", mac: "Zed", cmd: "zed" },
  { name: "Sublime Text", mac: "Sublime Text", cmd: "subl" },
  { name: "Ghostty", mac: "Ghostty", cmd: "ghostty", args: (p) => [`--working-directory=${p}`] },
  { name: "iTerm", mac: "iTerm" },
  { name: "Warp", mac: "Warp" },
  { name: "Kitty", mac: "kitty", cmd: "kitty", args: (p) => ["--directory", p], macArgs: true },
  { name: "GitHub Desktop", mac: "GitHub Desktop", cmd: "github-desktop" },
];

async function installed() {
  const mac = window()?.platform === "macos";
  const out = [];
  for (const app of APPS) {
    if (mac && app.mac) {
      const r = await exec("sh", ["-c", 'test -d "/Applications/$1.app" || test -d "$HOME/Applications/$1.app"', "x", app.mac]).catch(() => null);
      if (r?.code === 0) out.push(app);
    } else if (!mac && app.cmd) {
      const r = await exec("sh", ["-c", 'command -v "$1" >/dev/null', "x", app.cmd]).catch(() => null);
      if (r?.code === 0) out.push(app);
    }
  }
  return out;
}

async function open(app, path) {
  if (window()?.platform === "macos") return exec("open", ["-a", app.mac, ...(app.macArgs && app.args ? ["--args", ...app.args(path)] : [path])]);
  return exec(app.cmd, app.args ? app.args(path) : [path]);
}

export class OpenIn {
  init(p, cx) {
    this.p = p;
    this.apps = null;
    cx.spawn(async (cx) => { this.apps = await installed(); cx.notify(); });
  }

  render() {
    const th = theme();
    if (this.busy) return div();
    const items = (this.apps ?? []).map((app) => ["external-link", app.name, () => open(app, this.p.path)]);
    return menu("open-in", th, items, (action, cx) => runThenClose(this, action, cx), { header: t("openIn"), iconSize: 13 })
      .when(this.apps === null, (el) => el.child(div().px(8).py(6).text_color(th.dim).child("…")))
      .when(this.apps?.length === 0, (el) => el.child(div().px(8).py(6).text_size(12).text_color(th.dim).child(t("noApps"))));
  }
}
