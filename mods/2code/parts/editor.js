// A file in its own tab, like 2code's file viewer: an editor with syntax
// highlighting and save (cmd-s / ctrl-s), unsaved dot, reload when the file
// changes on disk (or a choice when there are unsaved edits), a recovery copy
// while unsaved (Herdr can close a tab without asking), markdown edit / split /
// preview, and images. Uses Herdr's own Editor (no CodeMirror: there's no web
// view); files on other machines open read-only (writeTextFile is local).
import { div, image } from "gpui-kit";
import { v_flex, h_flex, Editor, EditorState, TextView, InputState, Input } from "gpui-base";
import { theme, settings, shared, focused, readTextFile, writeTextFile, appHome, exec, run } from "herdr";
import * as fs from "fs/promises";
import { t } from "../lib/i18n.js";
import { fileIcon } from "../lib/fileIcons.js";
import { fileKey, setDirty, editorOf, openFile } from "../lib/editor.js";
import { parentOf } from "../lib/fileops.js";
import { isImage, imageSize, fit } from "../lib/changes.js";
import { button, icon, iconButton, errText, focusInput, CACHE } from "../lib/ui.js";

const LANG = { ts: "js", tsx: "js", mts: "js", cts: "js", jsx: "js", mjs: "js", cjs: "js", toml: "yaml", jsonc: "json", json5: "json", svelte: "html", vue: "html", htm: "html", zsh: "bash", sh: "bash", yml: "yaml", py: "python", rb: "ruby", rs: "rust", md: "markdown", mdx: "markdown" };
const MARKDOWN = /\.(md|mdx|markdown)$/i;
// Resolves "." and ".." in an absolute path.
const normalize = (p) => p.split("/").reduce((out, s) => (s === ".." ? out.slice(0, -1) : s === "." || (s === "" && out.length) ? out : [...out, s]), []).join("/");
const hash = (s) => { let h = 5381; for (let i = 0; i < s.length; i++) h = ((h * 33) ^ s.charCodeAt(i)) >>> 0; return h.toString(36); };

export class EditorPart {
  command(name, cx) {
    if (name === "save") this.save(cx);
    if ((name === "findInFile" || name === "goToLine") && this.mine()) this.openBar(name === "goToLine" ? "line" : "find", cx);
  }

  // Key commands reach every open editor; this one is the focused tab's.
  mine() {
    const e = editorOf(focused()?.tab);
    return Boolean(e && fileKey(e.path, e.on) === this.key);
  }

  // Find in file / go to line: a bar under the header; the match or line is
  // selected in the editor.
  openBar(mode, cx) {
    if (!this.state || (this.kind === "markdown" && this.mode === "preview")) return;
    const sel = this.state.selected_range(), picked = this.state.value().slice(sel.start, sel.end);
    this.barInput?.release();
    this.bar = { mode, at: -1, matches: [], len: 0 };
    this.barInput = InputState.new({ placeholder: t(mode === "line" ? "goToLinePlaceholder" : "findInFilePlaceholder"), value: mode === "find" && !picked.includes("\n") ? picked : "" });
    this.barInput.on("change", (_e, cx) => { if (this.bar?.mode === "find") this.search(cx); });
    this.barInput.on("submit", (_e, cx) => (this.bar?.mode === "line" ? this.goToLine(cx) : this.step(1, cx)));
    focusInput(this.barInput, cx, 100);
    if (mode === "find") this.search(cx);
    cx.notify();
  }

  search(cx) {
    const q = this.barInput.value().toLowerCase(), text = this.state.value().toLowerCase(), matches = [];
    if (q) for (let i = text.indexOf(q); i >= 0 && matches.length < 10000; i = text.indexOf(q, i + q.length)) matches.push(i);
    // Stays on the match at or after the cursor while typing.
    const from = this.state.selected_range().start;
    this.bar = { ...this.bar, matches, len: q.length, at: matches.length ? Math.max(0, matches.findIndex((m) => m >= from)) : -1 };
    if (this.bar.at >= 0) this.selectMatch(cx);
    cx.notify();
  }

  selectMatch(cx) {
    const s = this.bar.matches[this.bar.at];
    this.reveal(s, s + this.bar.len, cx);
  }

  // Selects a range. The editor scrolls just enough and lands a little short
  // at the bottom, so it first scrolls to a few lines below, a frame earlier.
  reveal(start, end, cx) {
    const text = this.state.value();
    let below = end;
    for (let i = 0; i < 8 && below >= 0; i++) below = text.indexOf("\n", below + 1);
    if (below < 0) below = text.length;
    this.state.set_selected_range({ start: below, end: below });
    cx.timer.after(30, () => this.state?.set_selected_range({ start, end }));
  }

  step(dir, cx) {
    const n = this.bar.matches.length;
    if (!n) return;
    this.bar.at = (this.bar.at + dir + n) % n;
    this.selectMatch(cx);
    cx.notify();
  }

  goToLine(cx) {
    const n = parseInt(this.barInput.value(), 10), text = this.state.value();
    if (!(n > 0)) return;
    let at = 0;
    for (let line = 1; line < n; line++) { const i = text.indexOf("\n", at); if (i < 0) break; at = i + 1; }
    this.reveal(at, at, cx);
    this.closeBar(cx);
  }

  closeBar(cx) {
    this.bar = null;
    this.state?.focus();
    cx.notify();
  }

  barRow(th) {
    const b = this.bar, find = b.mode === "find";
    const count = !find ? "" : b.matches.length ? `${b.at + 1} / ${b.matches.length}` : this.barInput.value() ? t("noResults") : "";
    const btn = (id, glyph, onClick) => iconButton(id, glyph, th, onClick, { size: 24 });
    return h_flex().h(36).flex_none().px(12).gap(6).items_center().border_b(1).border_color(th.border)
      .on_key_down((e, cx) => { if (e.key === "escape") { cx.stop_propagation(); this.closeBar(cx); } })
      .child(icon(find ? "search" : "chevron-right", 13).text_color(th.dim))
      .child(div().flex_1().min_w(0).child(Input.new(this.barInput).h(28).text_size(12.5).text_color(th.foreground)))
      .when(find, (el) => el.child(div().flex_none().text_size(11.5).text_color(th.dim).child(count))
        .child(btn("find-prev", "chevron-up", (_e, cx) => this.step(-1, cx)))
        .child(btn("find-next", "chevron-down", (_e, cx) => this.step(1, cx))))
      .child(btn("bar-close", "x", (_e, cx) => this.closeBar(cx)));
  }

  // Web links go to the browser; links to files open them in a tab.
  link(url, cx) {
    if (/^(https?|mailto):/i.test(url)) return cx.open_url(url);
    let rel = url.replace(/^file:\/\//i, "").split(/[?#]/)[0];
    try { rel = decodeURIComponent(rel); } catch {}
    if (!rel) return;
    const path = normalize(rel.startsWith("/") ? rel : `${parentOf(this.path)}/${rel}`);
    cx.spawn(async (cx) => openFile(cx, { path, on: this.on, root: this.root }));
  }

  init(p, cx) {
    this.path = p.path; this.on = p.on ?? null; this.root = p.root ?? null;
    this.key = fileKey(this.path, this.on); this.id = hash(this.key);
    this.kind = "loading"; // text | markdown | image | binary | missing | error
    this.mode = localStorage.getItem("mdMode") ?? "split";
    this.readonly = Boolean(this.on);
    this.state = null; this.saved = null; this.dirty = false; this.banner = null; this.request = null;
    this.recovery = `${appHome()}/${CACHE}/recovery/${this.id}.txt`; this.recovered = null;
    cx.spawn(async (cx) => { await this.load(cx); });
    cx.timer.every(3000, (cx) => this.poll(cx));
    cx.timer.every(1500, () => { this.keepRecovery(); });
  }

  async load(cx) {
    try {
      if (isImage(this.path) && !this.on) {
        const ext = this.path.split(".").pop(), rel = `${CACHE}/view/${this.id}.${ext}`;
        await fs.mkdir(`${appHome()}/${CACHE}/view`, { recursive: true });
        const r = await exec("cp", [this.path, `${appHome()}/${rel}`]);
        if (r.code !== 0) throw new Error(r.stderr);
        this.image = { rel, size: await imageSize(rel) };
        this.kind = "image";
        return;
      }
      const text = await readTextFile(this.path, { on: this.on });
      if (text === null) { this.kind = "missing"; return; }
      if (text.includes("\0")) { this.kind = "binary"; return; }
      this.saved = text;
      // A tab closed while unsaved leaves its flag behind; a fresh load is clean.
      setDirty(this.path, this.on, false);
      this.makeState(text);
      this.kind = MARKDOWN.test(this.path) ? "markdown" : "text";
      if (!this.readonly) {
        const rec = await fs.readFile(this.recovery, "utf8").catch(() => null);
        if (rec !== null && rec !== text) this.banner = { kind: "recover", text: rec };
      }
    } catch (e) {
      this.kind = "error"; this.error = errText(e);
    } finally { cx.notify(); }
  }

  makeState(text) {
    const th = theme(), ext = this.path.includes(".") ? this.path.split(".").pop().toLowerCase() : "txt";
    this.state = EditorState.new({
      language: LANG[ext] ?? ext, value: text, readonly: this.readonly,
      font_family: settings().font_family, font_size: 13,
      syntax: { keyword: th.ansi5, string: th.ansi2, comment: th.dim, function: th.ansi4, type: th.ansi3, number: th.ansi1, constant: th.ansi6 },
    });
    this.state.on("change", (_e, cx) => this.changed(cx));
  }

  changed(cx) {
    const dirty = this.state.value() !== this.saved;
    if (dirty !== this.dirty) { this.dirty = dirty; setDirty(this.path, this.on, dirty); cx.notify(); }
    else if (this.kind === "markdown" && this.mode !== "edit") cx.notify();
  }

  // While unsaved, a copy lives in the mod's cache; it goes once saved or discarded.
  keepRecovery() {
    if (this.readonly || !this.state) return;
    const text = this.dirty ? this.state.value() : null;
    if (text === this.recovered) return;
    this.recovered = text;
    if (text === null) fs.unlink(this.recovery).catch(() => {});
    else this.writeRecovery(text);
  }

  writeRecovery(text) {
    return fs.mkdir(`${appHome()}/${CACHE}/recovery`, { recursive: true }).then(() => fs.writeFile(this.recovery, text)).catch(() => {});
  }

  markSaved(text) {
    this.saved = text; this.dirty = false; this.banner = null;
    setDirty(this.path, this.on, false);
    this.recovered = null; fs.unlink(this.recovery).catch(() => {});
  }

  save(cx, then) {
    if (this.readonly || !this.state || this.saving) return;
    if (!this.dirty) { then?.(); return; }
    const text = this.state.value();
    this.saving = true; cx.notify();
    cx.spawn(async (cx) => {
      try { await writeTextFile(this.path, text, this.saved); this.markSaved(text); then?.(); }
      catch { this.banner = { kind: "conflict" }; }
      finally { this.saving = false; cx.notify(); }
    });
  }

  // Changed on disk: take it when nothing's unsaved, else ask.
  poll(cx) {
    if (!this.state || this.polling || this.saving) return;
    this.polling = true;
    cx.spawn(async (cx) => {
      try {
        const disk = await readTextFile(this.path, { on: this.on }).catch(() => undefined);
        if (disk === undefined || disk === null || disk === this.saved || this.banner?.kind === "changed") return;
        if (!this.dirty) { this.saved = disk; this.state.set_value(disk); }
        else this.banner = { kind: "changed", disk };
        cx.notify();
      } finally { this.polling = false; }
    });
  }

  reload(cx) {
    cx.spawn(async (cx) => {
      const disk = await readTextFile(this.path, { on: this.on }).catch(() => null);
      if (disk === null) return;
      this.state.set_value(disk); this.markSaved(disk);
      cx.notify();
    });
  }

  // Close buttons on the tab strip ask the shown editor through shared state.
  handleRequest(cx) {
    const req = shared("2code.editorRequest");
    if (!req || req.key !== this.key || req.nonce === this.request) return;
    this.request = req.nonce;
    const close = () => { const id = focused()?.tab; if (id) run("tab.close", { id, confirmed: true }); };
    if (req.action === "save-close") this.save(cx, close);
    else if (req.action === "discard-close") { if (this.state) this.state.set_value(this.saved ?? ""); this.markSaved(this.saved ?? ""); close(); }
  }

  async close() {
    if (this.dirty && this.state && !this.readonly) await this.writeRecovery(this.state.value());
  }

  bannerRow(th) {
    const b = this.banner;
    if (!b) return null;
    const row = (text, actions) => h_flex().px(12).py(8).gap(8).items_center().bg(th.blocked + "22").border_b(1).border_color(th.border).text_size(12.5)
      .child(div().flex_1().min_w(0).child(text)).children(actions);
    if (b.kind === "recover") return row(t("recoverBanner"), [
      button("recover-no", th, t("discard"), (_e, cx) => { this.banner = null; fs.unlink(this.recovery).catch(() => {}); cx.notify(); }),
      button("recover-yes", th, t("restore"), (_e, cx) => { this.state.set_value(b.text); this.banner = null; cx.notify(); }, { primary: true })]);
    if (b.kind === "changed") return row(t("changedOnDisk"), [
      button("keep-mine", th, t("keepMine"), (_e, cx) => { this.saved = b.disk; this.banner = null; cx.notify(); }),
      button("reload", th, t("reload"), (_e, cx) => this.reload(cx), { primary: true })]);
    return row(t("saveConflict"), [
      button("reload", th, t("reload"), (_e, cx) => this.reload(cx)),
      button("overwrite", th, t("overwrite"), (_e, cx) => cx.spawn(async (cx) => {
        this.saved = await readTextFile(this.path, { on: this.on }).catch(() => null); this.banner = null; this.save(cx);
      }), { primary: true })]);
  }

  body(th) {
    const code = () => Editor.new(this.state).id(`ed-${this.id}`).absolute().inset_0();
    const preview = () => div().id(`md-${this.id}`).absolute().inset_0().p(20).overflow_y_scrollbar()
      .child(TextView.markdown(`mdv-${this.id}`, this.state.value()).selectable().on_link_click((url, cx) => this.link(url, cx)));
    const box = (child) => div().flex_1().min_w(0).min_h(0).relative().child(child);
    if (this.kind === "text") return box(code());
    if (this.kind === "markdown") {
      if (this.mode === "edit") return box(code());
      if (this.mode === "preview") return box(preview());
      // h_flex centers its children; the halves hold only absolute children, so give them the height.
      return h_flex().flex_1().min_h(0).child(box(code()).h_full()).child(div().w(1).h_full().bg(th.border)).child(box(preview()).h_full());
    }
    if (this.kind === "image") {
      const s = fit(this.image.size, 900, 640);
      return div().flex_1().min_h(0).flex().items_center().justify_center().bg(th.canvas)
        .child(v_flex().gap(8).items_center().child(image(this.image.rel).w(s.w).h(s.h))
          .when(Boolean(this.image.size), (el) => el.child(div().text_size(11).text_color(th.dim).child(`${this.image.size.w} × ${this.image.size.h}`))));
    }
    const note = { loading: t("fileLoading"), binary: t("fileBinary"), missing: t("fileGone"), error: `${t("fileUnreadable")} ${this.error ?? ""}` }[this.kind];
    return div().flex_1().p(20).text_color(th.dim).child(note ?? "");
  }

  render(cx) {
    const th = theme();
    shared("2code.locale");
    this.handleRequest(cx);
    const rel = this.root && this.path.startsWith(this.root + "/") ? this.path.slice(this.root.length + 1) : this.path;
    const seg = (mode, label) => div().id(`m-${mode}`).h(24).px(9).flex().items_center().rounded(5).cursor_pointer().text_size(12)
      .bg(this.mode === mode ? th.background : th.raised).text_color(this.mode === mode ? th.foreground : th.dim)
      .on_click((_e, cx) => { this.mode = mode; localStorage.setItem("mdMode", mode); cx.notify(); }).child(label);
    return v_flex().id(`editor-${this.id}`).size_full().min_h(0).bg(th.background).text_color(th.foreground).text_size(13)
      .child(h_flex().h(36).flex_none().px(12).gap(8).items_center().border_b(1).border_color(th.border)
        .child(image(fileIcon(this.path, false, false, settings().dark)).size(15).flex_none())
        .child(div().flex_1().min_w(0).truncate().text_size(12.5).text_color(th.muted).child(rel))
        .when(this.dirty, (el) => el.child(div().size(7).rounded(4).bg(th.foreground).flex_none()))
        .when(this.readonly && Boolean(this.state), (el) => el.child(div().text_size(11).text_color(th.dim).child(t("readOnly"))))
        .when(this.kind === "markdown", (el) => el.child(h_flex().p(2).gap(2).rounded(6).bg(th.raised)
          .child(seg("edit", t("mdEdit"))).child(seg("split", t("mdSplit"))).child(seg("preview", t("mdPreview")))))
        .when(Boolean(this.state) && !this.readonly, (el) => el.child(button("save", th, this.saving ? t("saving") : t("save"), (_e, cx) => this.save(cx), { disabled: !this.dirty || this.saving }))))
      .when(Boolean(this.banner), (el) => el.child(this.bannerRow(th)))
      .when(Boolean(this.bar), (el) => el.child(this.barRow(th)))
      .child(this.body(th));
  }
}
