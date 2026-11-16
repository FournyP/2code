// Right-click menus for a project row and a profile row (popups at the pointer).
import { div } from "gpui-kit";
import { theme, run, openOverlay } from "herdr";
import { t } from "../lib/i18n.js";
import { openPath } from "../lib/os.js";
import { menu, runThenClose } from "../lib/ui.js";
import { openNewProfile, deleteProfile } from "./sidebar.js";

export class Menu {
  init(p) {
    this.p = p;
  }

  items() {
    const { kind, target: x } = this.p;
    const local = !x.machine;
    const project = { path: x.path, machine: x.machine, on: x.machine, name: x.name };
    if (kind === "project") return [
      ...(!x.group ? [["plus", t("newProfile"), () => openNewProfile(project)]] : []),
      ["square-pen", t("rename"), () => openOverlay({ mod: "2code", kind: "dialog", width: 420, height: 220, props: { part: "rename", path: x.path, machine: x.machine, name: x.name } })],
      ["settings", t("projectSettings"), () => openOverlay({ mod: "2code", kind: "dialog", width: 640, height: 0.8, props: { part: "projectSettings", path: x.path, machine: x.machine, name: x.name } })],
      ...(local ? [["folder", t("reveal"), () => openPath(x.path)]] : []),
      ["x", t("removeProject"), () => openOverlay({ mod: "2code", kind: "dialog", width: 440, height: 220, props: { part: "removeProject", path: x.path, machine: x.machine, name: x.name } })],
    ];
    return [
      ["terminal", t("open"), () => (x.space ? run("space.select", { id: x.space }) : run("space.new", { folder: x.top, machine: x.machine ?? "" }))],
      ...(local ? [["folder", t("reveal"), () => openPath(x.top)]] : []),
      ...(!x.main ? [["x", t("deleteProfile"), () => deleteProfile(project, { path: x.top, branch: x.branch, spaces: (x.spaces ?? []).map((id) => ({ id })) })]] : []),
    ];
  }

  render() {
    if (this.busy) return div();
    return menu("menu", theme(), this.items(), (action, cx) => runThenClose(this, action, cx));
  }
}
