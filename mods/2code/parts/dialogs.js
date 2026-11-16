// Small project dialogs: rename and remove.
import { div } from "gpui-kit";
import { InputState } from "gpui-base";
import { theme, spaces, run } from "herdr";
import { t } from "../lib/i18n.js";
import { renameProject, removeProject, projectName } from "../lib/projects.js";
import { place, repoOf } from "../lib/git.js";
import { button, frame, field, focusInput, closeSelf as close } from "../lib/ui.js";

export class Rename {
  init(p, cx) {
    this.p = p;
    const derived = projectName({ path: p.path });
    this.input = InputState.new({ value: p.name ?? "", placeholder: derived });
    this.input.on("submit", () => this.save());
    focusInput(this.input, cx);
  }

  save() {
    const derived = projectName({ path: this.p.path });
    const name = this.input.value().trim();
    renameProject(this.p.path, this.p.machine ?? null, name === derived ? "" : name);
    close();
  }

  render() {
    const th = theme();
    return frame(th, t("rename"), [
      div().text_size(12).text_color(th.muted).child(t("projectName")),
      field(this.input, th),
      div().text_size(11.5).text_color(th.dim).child(t("namePlaceholder")),
    ], [button("cancel", th, t("cancel"), close), button("save", th, t("save"), () => this.save(), { primary: true })], 12);
  }
}

// Removing a project takes it off the list and closes its open spaces
// (their terminals end); nothing on disk changes.
export class RemoveProject {
  init(p, cx) {
    this.p = p;
    this.spaces = null;
    cx.spawn(async (cx) => {
      const mine = [];
      for (const s of spaces()) {
        if ((s.machine ?? null) !== (p.machine ?? null)) continue;
        const r = await repoOf(place(s), s.machine).catch(() => null);
        if ((r?.main ?? place(s)) === p.path) mine.push(s.id);
      }
      this.spaces = mine;
      cx.notify();
    });
  }

  remove() {
    for (const id of this.spaces ?? []) run("space.close", { id, confirmed: true });
    removeProject(this.p.path, this.p.machine ?? null);
    close();
  }

  render() {
    const th = theme();
    return frame(th, t("removeProjectTitle", { name: this.p.name }), [
      div().text_color(th.muted).child(t("removeProjectBody", { name: this.p.name })),
      div().text_size(12).text_color(th.dim).child(this.spaces === null ? "…" : t("openSpaces", { count: this.spaces.length })),
    ], [button("cancel", th, t("cancel"), close), button("remove", th, t("remove"), () => this.remove(), { primary: true, disabled: this.spaces === null })], 12);
  }
}
