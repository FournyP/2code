import { div, svg } from "gpui-kit";
import { v_flex, h_flex, Input } from "gpui-base";
import { props, closeOverlay } from "herdr";

export const ICON = "mods/2code/icons";
export const CACHE = "mods/2code/.cache"; // relative to appHome(); hidden, so writes don't reload the mod
export const MONO = "JetBrains Mono";
export const icon = (name, size = 14) => svg(`${ICON}/${name}.svg`).size(size).flex_none();
export const stop = (_e, cx) => cx.stop_propagation();

// 2code's agent dots: running pulses, waiting is yellow, finished is green.
// Null when idle: use `.children([dot(...)].filter(Boolean))`.
export function dot(status, t) {
  const color = { working: t.working, blocked: t.blocked, done: t.done }[status];
  if (!color) return null;
  const d = div().size(7).flex_none().rounded(4).bg(color);
  return status === "working" ? d.loop("opacity", { from: 0.35, to: 1, period: 1200 }) : d;
}

const urgency = { blocked: 3, done: 2, working: 1, idle: 0 };
export const worst = (statuses) => statuses.filter(Boolean).sort((a, b) => urgency[b] - urgency[a])[0] ?? null;

export function find(node, id) {
  if (node?.id === id) return node;
  for (const child of node?.children ?? []) {
    const found = find(child, id);
    if (found) return found;
  }
  return null;
}

// A plain button: `label` is text or an element.
export function button(id, t, label, onClick, { primary = false, disabled = false } = {}) {
  return div().id(id).h(30).px(12).flex().items_center().justify_center().rounded(6).text_size(12.5)
    .border_1().border_color(primary ? t.solid : t.border)
    .bg(primary ? (disabled ? t.raised : t.solid) : t.background)
    .text_color(primary ? (disabled ? t.dim : t.solid_foreground) : t.foreground)
    .when(!disabled, (el) => el.cursor_pointer().hover((s) => s.opacity(0.85)).on_click(onClick))
    .child(label);
}

export const closeSelf = () => closeOverlay(props().overlay);
export const errText = (e) => String(e?.message ?? e);

// Focus a dialog's input now and again once it's shown.
export function focusInput(input, cx, ms = 300) {
  input.focus();
  cx.timer.after(ms, () => input.focus());
}

// A popup's tasks end when it closes: run the action to the end (the popup
// draws nothing meanwhile, see `busy`), then close.
export function runThenClose(self, action, cx) {
  if (self.busy) return;
  self.busy = true;
  cx.notify();
  cx.spawn(async (cx) => { try { await action(cx); } finally { closeSelf(); } });
}

// A popup menu of [glyph, label, action] rows.
export function menu(id, th, items, onPick, { header = null, h = 30, iconSize = 14 } = {}) {
  return v_flex().id(id).size_full().p(4).gap(1).bg(th.popover).text_color(th.foreground).text_size(13)
    .when(Boolean(header), (el) => el.child(div().px(8).pt(4).pb(2).text_size(11).text_color(th.dim).child(header)))
    .children(items.map(([glyph, label, action], i) => h_flex().id(`${id}-${i}`).h(h).px(8).gap(8).items_center().rounded(5).cursor_pointer()
      .hover((s) => s.bg(th.hover)).on_click((_e, cx) => onPick(action, cx))
      .child(icon(glyph, iconSize).text_color(th.muted)).child(div().flex_1().truncate().child(label))));
}

// A dialog: title, body rows, spacer, right-aligned actions.
export function frame(th, title, body, actions, gap = 10) {
  return v_flex().size_full().p(18).gap(gap).bg(th.popover).text_color(th.foreground).text_size(13)
    .child(div().text_size(15).font_semibold().child(title))
    .children(body.filter(Boolean))
    .child(div().flex_1())
    .child(h_flex().gap(8).justify_end().children(actions.filter(Boolean)));
}

export const field = (input, th) => div().px(10).rounded(6).border_1().border_color(th.accent).bg(th.background)
  .child(Input.new(input).h(32).text_size(13).text_color(th.foreground));
export const errorLine = (error, th) => error ? div().text_size(12).text_color(th.ansi1).child(error) : null;

// Esc closes; up / down move `self.at` through `n` rows, wrapping.
export function listKey(self, e, cx, n) {
  if (e.key === "escape") return closeSelf();
  if ((e.key === "down" || e.key === "up") && n) {
    self.at = (self.at + (e.key === "down" ? 1 : n - 1)) % n;
    cx.stop_propagation(); cx.notify();
  }
}
