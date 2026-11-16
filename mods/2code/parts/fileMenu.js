// Right-click menu on the file tree, with 2code's items, and its dialogs:
// new file / folder, rename and delete.
import { div } from "gpui-kit";
import { InputState } from "gpui-base";
import { theme, setShared, openOverlay } from "herdr";
import { t } from "../lib/i18n.js";
import { openPath } from "../lib/os.js";
import { openFile, requestEditor, baseName } from "../lib/editor.js";
import { createFile, createFolder, rename, remove, removePermanently, parentOf } from "../lib/fileops.js";
import { repoOf } from "../lib/git.js";
import { button, menu, runThenClose, frame, field, errorLine, focusInput, closeSelf, errText } from "../lib/ui.js";

const refresh = () => setShared("2code.filesRefresh", Date.now());

export class FileMenu {
  init(p, cx) {
    this.p = p;
    // A file tab opened before roots were kept: take the checkout's.
    if (!p.root) cx.spawn(async (cx) => { this.root = (await repoOf(parentOf(p.path), p.on))?.top; cx.notify(); });
  }

  items() {
    const { path, dir, on, space, tab } = this.p, local = !on;
    const root = this.p.root ?? this.root ?? parentOf(path);
    const rel = path.startsWith(root + "/") ? path.slice(root.length + 1) : path;
    if (tab) return [
      ["copy", t("copyRelativePath"), (cx) => cx.write_to_clipboard(rel)],
      ["copy", t("copyAbsolutePath"), (cx) => cx.write_to_clipboard(path)],
      ...(local ? [["folder", t("reveal"), () => openPath(parentOf(path))], ["external-link", t("openDefault"), () => openPath(path)]] : []),
    ];
    const folder = dir ? path : parentOf(path);
    const dialog = (part, extra = {}) => () => openOverlay({ mod: "2code", kind: "dialog", width: 440, height: 220, props: { part, root, on, ...extra } });
    return [
      ...(!dir ? [["file", t("open"), (cx) => openFile(cx, { space, path, on, root })]] : []),
      ...(local ? [["external-link", t("openDefault"), () => openPath(path)], ["folder", t("reveal"), () => openPath(dir ? path : parentOf(path))]] : []),
      ["plus", t("newFile"), dialog("filePrompt", { mode: "file", folder })],
      ["folder", t("newFolder"), dialog("filePrompt", { mode: "folder", folder })],
      ["square-pen", t("rename"), dialog("filePrompt", { mode: "rename", path })],
      ["copy", t("copyRelativePath"), (cx) => cx.write_to_clipboard(rel)],
      ["copy", t("copyAbsolutePath"), (cx) => cx.write_to_clipboard(path)],
      ["undo", t("refresh"), () => refresh()],
      ["x", t("delete"), dialog("fileDelete", { path, dir })],
    ];
  }

  render() {
    if (this.busy) return div();
    return menu("file-menu", theme(), this.items(), (action, cx) => runThenClose(this, action, cx), { h: 28, iconSize: 13 });
  }
}

// New file, new folder or rename: one name field.
export class FilePrompt {
  init(p, cx) {
    this.p = p;
    const current = p.mode === "rename" ? p.path.split("/").pop() : "";
    this.input = InputState.new({ value: current, placeholder: t(p.mode === "folder" ? "folderNamePlaceholder" : "fileNamePlaceholder") });
    if (current) this.input.set_selected_range({ start: 0, end: current.includes(".") ? current.lastIndexOf(".") : current.length });
    this.input.on("submit", (_e, cx) => this.go(cx));
    focusInput(this.input, cx);
  }

  go(cx) {
    const name = this.input.value().trim();
    if (!name || this.busy) return;
    const { mode, on, root } = this.p;
    this.busy = true; this.error = null; cx.notify();
    cx.spawn(async (cx) => {
      try {
        if (mode === "rename") await rename(this.p.path, `${parentOf(this.p.path)}/${name}`, on);
        else if (mode === "folder") await createFolder(`${this.p.folder}/${name}`, on);
        else {
          const path = `${this.p.folder}/${name}`;
          await createFile(path, on);
          await openFile(cx, { path, on, root });
        }
        refresh();
        closeSelf();
      } catch (e) { this.error = errText(e); }
      finally { this.busy = false; cx.notify(); }
    });
  }

  render() {
    const th = theme(), mode = this.p.mode;
    return frame(th, t(mode === "rename" ? "rename" : mode === "folder" ? "newFolder" : "newFile"), [
      div().text_size(12).text_color(th.dim).truncate().child(mode === "rename" ? this.p.path : this.p.folder),
      field(this.input, th),
      errorLine(this.error, th),
    ], [
      button("cancel", th, t("cancel"), closeSelf),
      button("ok", th, t(mode === "rename" ? "rename" : "create"), (_e, cx) => this.go(cx), { primary: true, disabled: this.busy }),
    ]);
  }
}

export class FileDelete {
  init(p) {
    this.p = p;
  }

  // Trash first; when the trash refuses (some mounts have none), say so and
  // let the person choose to delete for good.
  go(cx, permanently = false) {
    if (this.busy) return;
    this.busy = true; this.error = null; cx.notify();
    cx.spawn(async (cx) => {
      try {
        await (permanently ? removePermanently : remove)(this.p.path, this.p.on);
        refresh(); closeSelf();
      } catch (e) { this.error = errText(e); this.trashFailed = !permanently; }
      finally { this.busy = false; cx.notify(); }
    });
  }

  render() {
    const th = theme(), name = this.p.path.split("/").pop();
    return frame(th, t("deleteFileTitle", { name }), [
      div().text_color(th.muted).child(t(this.p.dir ? "deleteFolderBody" : "deleteFileBody")),
      errorLine(this.error, th),
    ], [
      button("cancel", th, t("cancel"), closeSelf),
      this.trashFailed && button("delete-forever", th, t("deletePermanently"), (_e, cx) => this.go(cx, true), { disabled: this.busy }),
      button("delete", th, t("delete"), (_e, cx) => this.go(cx), { primary: true, disabled: this.busy }),
    ]);
  }
}

// Closing a tab with unsaved edits: Save / Don't Save / Cancel. The file's
// editor is shown (its tab was selected first) and acts on the request.
export class Unsaved {
  init(p) {
    this.p = p;
  }

  answer(action) {
    requestEditor(this.p.path, this.p.on ?? null, action);
    closeSelf();
  }

  render() {
    const th = theme();
    return frame(th, t("unsavedTitle", { name: baseName(this.p.path) }), [div().text_color(th.muted).child(t("unsavedBody"))], [
      button("cancel", th, t("cancel"), closeSelf),
      button("dont-save", th, t("dontSave"), () => this.answer("discard-close")),
      button("save", th, t("save"), () => this.answer("save-close"), { primary: true }),
    ]);
  }
}
