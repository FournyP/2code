// The 2code sidebar: projects with their profiles nested.
// - Projects are the saved list (lib/projects.js); any space opened on a repo
//   that isn't in it yet is added, so it stays after its terminals close.
// - Profiles are the repo's checkouts (`git worktree list`): the main checkout
//   first, then worktrees. Open ones show their space's status; picking a
//   closed one opens a space there.
import { div, image } from "gpui-kit";
import { v_flex, h_flex } from "gpui-base";
import { spaces, panes, focused, run, theme, layout, window, pickFolder, openOverlay, shared, notify } from "herdr";
import { t, resolveLocale } from "../lib/i18n.js";
import { readProjectConfig, scriptArgv } from "../lib/config.js";
import { place, repoOf } from "../lib/git.js";
import { savedProjects, addProject, moveProject, orderChildren, projectKey, projectName, checkouts, childRepos } from "../lib/projects.js";
import { githubOwner, githubAvatar } from "../lib/os.js";
import { icon, iconButton, stop, dot, worst, find } from "../lib/ui.js";

const RAIL = 160; // narrower than this, the sidebar draws only project tiles

// The brand: Herdr's mark and name, and on hover a slot-machine flip to
// 2code's: the shown one rolls out first, the other rolls in a beat later;
// leaving rolls them back. Native transitions, no timers. (`spring` on `top`
// didn't move here; `transition` does.)
export class SidebarHeader {
  init() {
    this.hover = false;
  }

  layer(id, logo, text, shown, away, th) {
    // The policy set with the new target is the one that runs: arriving
    // layers wait a beat and ease out, leaving ones ease in right away.
    const move = shown ? { duration: 380, delay: 70, easing: "ease-out" } : { duration: 260, easing: "ease-in" };
    const fade = shown ? { duration: 260, delay: 70, easing: "ease-out" } : { duration: 180, easing: "ease-in" };
    return h_flex().id(id).absolute().left(0).top(shown ? 0 : away).h(24).gap(8).items_center()
      .opacity(shown ? 1 : 0)
      .transition("top", move)
      .transition("opacity", fade)
      .child(image(logo).size(20).flex_none().rounded(5))
      .child(div().text_size(15).font_semibold().text_color(th.foreground).child(text));
  }

  render() {
    const th = theme(), w = window();
    const narrow = (find(layout(), "sidebar")?.size?.px ?? 250) < RAIL;
    // macOS draws its window buttons at the layout's traffic_lights spot
    // (vertically centered on this 52px row); on the rail they fill it.
    const lights = w?.platform === "macos" && w?.titlebar === "none" && !w?.fullscreen;
    if (lights && narrow) return div().size_full().bg(th.chrome);
    return h_flex().id("brand-row").size_full().px(narrow ? 0 : 16).items_center().bg(th.chrome)
      .when(lights && !narrow, (el) => el.pl(76))
      .on_hover((h, cx) => { if (this.hover !== h) { this.hover = h; cx.notify(); } })
      .when(narrow, (el) => el.justify_center())
      .when(!narrow, (el) => el.justify_between().child(div().relative().w(110).h(24).overflow_hidden()
        .child(this.layer("brand-herdr", "frame/welcome/herdr.png", "Herdr", !this.hover, -26, th))
        .child(this.layer("brand-2code", "mods/2code/icons/2code.png", "2Code", this.hover, 26, th))))
      .child(div().id("sidebar-toggle").size(24).flex().items_center().justify_center().rounded(6).text_color(th.dim)
        .hover((s) => s.bg(th.hover).text_color(th.foreground)).on_mouse_down("left", stop)
        .on_click(() => run("layout.toggle", { id: "sidebar" }))
        .child(icon("sidebar", 15)));
  }
}

export class Sidebar {
  command(name) {
    if (name === "focusSidebar") this.handle.focus();
  }

  init(_props, cx) {
    // Arrow keys move through the list while it has the keyboard (a click on
    // the sidebar, or cmd-shift-e / ctrl-shift-j).
    this.handle = cx.focus_handle();
    this.cursor = null;
    this.repo = {};       // space id -> { at, main, top, name }
    this.checkouts = {};  // project key -> [{ path, branch, main }]
    this.children = {};   // group key -> child repo paths
    this.scanned = {};    // group key -> when children were listed
    this.avatars = {};    // project key -> image path | null
    this.closed = JSON.parse(localStorage.getItem("closed") ?? "{}");
    this.hover = null;
    this.width = 250;
    cx.spawn(async () => { await resolveLocale(); });
    this.refresh(cx);
    cx.timer.every(4000, (cx) => this.refresh(cx));
  }

  refresh(cx) {
    if (this.busy) return;
    this.busy = true;
    cx.spawn(async (cx) => {
      try {
        // Which repo every open space is in; new repos join the project list.
        const all = panes();
        for (const s of spaces()) {
          const at = place(s, all);
          if (!at) continue;
          // A failed lookup (machine not up yet, folder gone) is tried again.
          if (this.repo[s.id]?.at !== at || this.repo[s.id].linked === undefined) {
            const r = await repoOf(at, s.machine);
            this.repo[s.id] = r ? { at, ...r } : { at, main: at, top: at, name: at.split("/").pop() || at };
          }
          // Only repos: a plain or deleted folder isn't a project.
          if (this.repo[s.id].linked !== undefined) addProject(this.repo[s.id].main, s.machine ?? null);
        }
        const nested = new Set(Object.values(this.children).flat());
        for (const p of savedProjects()) if (!nested.has(p.path)) await this.load(p);
      } catch {}
      finally { this.busy = false; cx.notify(); }
    });
  }

  // A project's checkouts, its child repos if it's a group, and its GitHub avatar once.
  async load(p, nested = false) {
    const key = projectKey(p);
    this.checkouts[key] = await checkouts(p.path, p.machine);
    // Child repos: rescanned every 30s.
    if (nested || !this.checkouts[key][0]?.plain) this.children[key] = [];
    else if (!this.children[key] || Date.now() - (this.scanned[key] ?? 0) > 30000) {
      this.children[key] = await childRepos(p.path, p.machine);
      this.scanned[key] = Date.now();
    }
    for (const c of this.children[key]) await this.load({ path: c, machine: p.machine ?? null }, true);
    if (!(key in this.avatars)) {
      this.avatars[key] = null;
      const owner = await githubOwner(p.path, p.machine).catch(() => null);
      this.avatars[key] = await githubAvatar(owner);
    }
  }

  // Saved projects in order, groups holding their child repos (`repos`).
  projects() {
    const saved = savedProjects(), on = (p) => p.machine ?? null, all = panes();
    const open = spaces().map((s) => ({ s, r: this.repo[s.id], at: place(s, all) }));
    const child = (g, c) => saved.find((q) => q.path === c && on(q) === on(g)) ?? { path: c, machine: on(g) };
    const nested = new Set(saved.flatMap((g) => (this.children[projectKey(g)] ?? []).map((c) => projectKey(child(g, c)))));
    return saved.filter((p) => !nested.has(projectKey(p))).map((p) => {
      const e = this.entry(p, open);
      // In the person's order (dragged), new repos last.
      const order = p.order ?? [], rank = (c) => (order.includes(c) ? order.indexOf(c) : order.length);
      e.repos = [...(this.children[e.key] ?? [])].sort((a, b) => rank(a) - rank(b)).map((c) => this.entry(child(p, c), open));
      e.every = [...e.profiles, ...e.repos.flatMap((r) => r.profiles)];
      return e;
    });
  }

  // One project; one profile per checkout, with all its spaces.
  entry(p, open) {
    const key = projectKey(p), on = p.machine ?? null, kids = this.children[key] ?? [];
    const list = this.checkouts[key] ?? [{ path: p.path, branch: null, main: true }];
    const profiles = list.map((c) => ({ ...c, spaces: [] }));
    for (const { s, r, at } of open) {
      if ((s.machine ?? null) !== on) continue;
      // Not refreshed yet or not a repo: match by folder (a group leaves its child repos' folders to them).
      let x = r?.linked !== undefined ? (r.main === p.path ? profiles.find((y) => y.path === r.top) : null)
        : kids.some((c) => at === c || at?.startsWith(c + "/")) ? null : within(profiles, at);
      // Checkout git didn't list (yet).
      if (!x && r?.main === p.path) profiles.push(x = { path: r.top, branch: s.branch, main: r.top === p.path, spaces: [] });
      x?.spaces.push(s);
    }
    for (const x of profiles) {
      x.space = x.spaces.find((s) => s.active) ?? x.spaces[0] ?? null;
      x.status = worst(x.spaces.map((s) => s.status));
      if (!x.branch) x.branch = x.spaces.find((s) => s.branch)?.branch ?? null;
    }
    return { path: p.path, machine: on, on, key, name: projectName(p), profiles, avatar: this.avatars[key] ?? null };
  }


  toggle(key) {
    this.closed[key] = !this.closed[key];
    localStorage.setItem("closed", JSON.stringify(this.closed));
  }

  addProject() {
    pickFolder({ prompt: t("addProject") }).then(async (folder) => {
      if (!folder) return;
      const r = await repoOf(folder, null).catch(() => null);
      addProject(r?.main ?? folder, null);
      run("space.new", { folder: r?.top ?? folder });
    });
  }

  // Opens a profile: its space if it has one, else a new space on its checkout.
  // Several spaces: cycles.
  openProfile(p, x) {
    const i = x.spaces?.findIndex((s) => s.active) ?? -1;
    const next = i >= 0 ? x.spaces[(i + 1) % x.spaces.length] : x.space;
    if (next) run("space.select", { id: next.id });
    else run("space.new", { folder: x.path, machine: p.on ?? "" });
  }

  openProject(p) {
    const all = p.every ?? p.profiles;
    const shown = all.find((x) => x.space?.active) ?? all.find((x) => x.space) ?? all[0];
    if (shown?.space) run("space.select", { id: shown.space.id });
    else if (shown) this.openProfile(p, shown);
  }

  menu(kind, p, x) {
    const target = { path: p.path, machine: p.on, name: p.name, group: Boolean(p.repos?.length), ...(x ? { top: x.path, branch: x.branch, main: x.main, space: x.space?.id ?? null, spaces: owned(x).map((s) => s.id) } : {}) };
    openOverlay({ mod: "2code", kind: "popup", width: 230, height: kind === "project" ? 196 : 124, props: { part: "menu", kind, target } });
  }

  avatar(p, th, size = 20) {
    if (p.avatar) return image(p.avatar).size(size).flex_none().rounded(5);
    return div().size(size).flex_none().flex().items_center().justify_center().rounded(5).bg(th.raised)
      .text_size(size * 0.55).font_semibold().text_color(th.muted).child((p.name[0] ?? "?").toUpperCase());
  }

  // Drag to reorder, within one level only: top-level projects among
  // themselves, a group's repos inside the group. Herdr has no in-app drag, so
  // it's a press on a row, moves over its siblings, and the release.
  dragOver(key, parent, e, cx) {
    const d = this.drag;
    const at = d && d.parent === parent && d.key !== key ? { key, before: e.local_position.y < e.bounds.height / 2 } : null;
    if (at?.key !== this.dropAt?.key || at?.before !== this.dropAt?.before) { this.dropAt = at; cx.notify(); }
  }

  drop(projects) {
    const d = this.drag, at = this.dropAt;
    this.drag = this.dropAt = null;
    if (!d || !at) return;
    if (!d.parent) return moveProject(d.key, at.key, at.before);
    const group = projects.find((g) => g.key === d.parent);
    const from = group?.repos.find((r) => r.key === d.key)?.path, to = group?.repos.find((r) => r.key === at.key)?.path;
    if (!from || !to) return;
    const paths = group.repos.map((r) => r.path).filter((x) => x !== from);
    paths.splice(paths.indexOf(to) + (at.before ? 0 : 1), 0, from);
    orderChildren({ path: group.path, machine: group.machine }, paths);
  }

  dropLine(th, depth) {
    return div().h(2).flex_none().ml(8 + depth * 16).mr(8).rounded(1).bg(th.accent);
  }

  projectRow(p, th, depth = 0, parent = "") {
    const all = p.every ?? p.profiles, group = Boolean(p.repos?.length);
    const active = all.some((x) => x.space?.active);
    const open = !this.closed[p.key];
    const status = worst(all.map((x) => x.status));
    const hovered = this.hover === p.key;
    return h_flex().id(`project-${p.key}`).h(32).pl(8 + depth * 16).pr(8).gap(8).items_center().rounded(6).cursor_pointer()
      .bg(active && !open ? th.selected : th.chrome).hover((s) => s.bg(th.hover))
      .border_1().border_color(this.ring(p.key) ? th.accent : th.chrome + "00")
      .on_hover((h, cx) => { this.hover = h ? p.key : (this.hover === p.key ? null : this.hover); cx.notify(); })
      .on_mouse_down("left", () => { this.drag = { key: p.key, parent }; this.dropAt = null; })
      .on_mouse_move((e, cx) => this.dragOver(p.key, parent, e, cx))
      .on_click(() => { this.cursor = p.key; this.openProject(p); })
      .on_mouse_down("right", (_e, cx) => { cx.stop_propagation(); this.menu("project", p); })
      .child(this.avatar(p, th))
      .child(div().flex_1().min_w(0).truncate().text_color(th.foreground).child(p.name))
      // The project's dot sums up its worktrees, so it shows only while they're folded away.
      .when(!open && !hovered, (el) => el.children([dot(status, th)].filter(Boolean)))
      .when(hovered && !group, (el) => el.child(iconButton(`profile-new-${p.key}`, "plus", th, (_e, cx) => { cx.stop_propagation(); cx.spawn(async () => openNewProfile(p)); }, { size: 20, hoverBg: th.raised })))
      .child(div().id(`project-caret-${p.key}`).size(18).flex().items_center().justify_center().text_color(th.dim)
        .on_click((_e, cx) => { cx.stop_propagation(); this.toggle(p.key); cx.notify(); })
        .child(icon(open ? "chevron-down" : "chevron-right", 13)));
  }

  profileRow(p, x, th, depth = 0) {
    const label = x.branch ?? (x.main ? t("defaultProfile") : x.path.split("/").pop());
    const id = `${p.key}:${x.path}`, hovered = this.hover === id, active = Boolean(x.space?.active);
    const color = active ? th.foreground : x.space ? th.muted : th.dim;
    return h_flex().id(`profile-${id}`).h(28).pl(36 + depth * 16).pr(8).gap(7).items_center().rounded(6).cursor_pointer()
      .bg(active ? th.selected : th.chrome).hover((st) => st.bg(th.hover))
      .border_1().border_color(this.ring(id) ? th.accent : th.chrome + "00")
      .on_hover((h, cx) => { this.hover = h ? id : (this.hover === id ? null : this.hover); cx.notify(); })
      .on_click(() => { this.cursor = id; this.openProfile(p, x); })
      .on_mouse_down("right", (_e, cx) => { cx.stop_propagation(); this.menu("profile", p, x); })
      .child(icon("git-branch", 13).text_color(color))
      .child(div().flex_1().min_w(0).truncate().text_size(12.5).text_color(color).child(label))
      // An 18px slot like the project's caret, so dots line up under it;
      // hovering a worktree swaps the dot for its delete button.
      .child(hovered && !x.main
        ? div().id(`profile-delete-${id}`).size(18).flex_none().flex().items_center().justify_center().rounded(5)
          .text_color(th.dim).hover((st) => st.bg(th.raised).text_color(th.foreground))
          .on_click((_e, cx) => { cx.stop_propagation(); deleteProfile(p, x); })
          .child(icon("x", 12))
        : div().w(18).flex_none().flex().items_center().justify_center()
          .children([dot(x.status, th)].filter(Boolean)));
  }

  ring(id) {
    return this.cursor === id && this.handle.is_focused();
  }

  // The rows the arrow keys walk, in screen order.
  navRows(projects) {
    return projects.flatMap((p) => [
      { id: p.key, p },
      ...(this.closed[p.key] ? [] : [...p.profiles.map((x) => ({ id: `${p.key}:${x.path}`, p, x })), ...this.navRows(p.repos ?? [])]),
    ]);
  }

  rows(p, th, depth = 0, parent = "") {
    const at = this.dropAt?.key === p.key ? this.dropAt : null;
    return [
      ...(at?.before ? [this.dropLine(th, depth)] : []),
      this.projectRow(p, th, depth, parent),
      ...(this.closed[p.key] ? [] : [...p.profiles.map((x) => this.profileRow(p, x, th, depth)), ...(p.repos ?? []).flatMap((r) => this.rows(r, th, depth + 1, p.key))]),
      ...(at && !at.before ? [this.dropLine(th, depth)] : []),
    ];
  }

  key(e, projects, cx) {
    const rows = this.navRows(projects);
    if (!rows.length) return;
    let i = rows.findIndex((r) => r.id === this.cursor);
    const row = rows[i];
    const k = e.key;
    if (k === "down") i = i < 0 ? 0 : Math.min(i + 1, rows.length - 1);
    else if (k === "up") i = i < 0 ? 0 : Math.max(i - 1, 0);
    else if (k === "right" && row && !row.x) {
      if (this.closed[row.p.key]) this.toggle(row.p.key);
      else if (rows[i + 1]?.x) i += 1;
    } else if (k === "left" && row) {
      if (row.x) i = rows.findIndex((r) => r.id === row.p.key);
      else if (!this.closed[row.p.key]) this.toggle(row.p.key);
    } else if ((k === "enter" || k === "space") && row) {
      if (row.x) this.openProfile(row.p, row.x); else this.openProject(row.p);
    } else if (k === "escape") {
      const pane = focused()?.pane;
      if (pane) run("pane.focus", { pane });
    } else return;
    this.cursor = rows[Math.max(0, i)]?.id ?? null;
    cx.stop_propagation();
    cx.notify();
  }

  rail(projects, th) {
    return v_flex().id("project-rail").flex_1().min_h(0).py(2).gap(6).items_center().overflow_y_scrollbar()
      .children(projects.map((p) => {
        const all = p.every ?? p.profiles, active = all.some((x) => x.space?.active), status = worst(all.map((x) => x.status));
        return div().id(`rail-${p.key}`).relative().p(4).rounded(7).cursor_pointer().bg(active ? th.selected : th.chrome).hover((s) => s.bg(th.hover))
          .on_click(() => this.openProject(p))
          .on_mouse_down("right", (_e, cx) => { cx.stop_propagation(); this.menu("project", p); })
          .child(this.avatar(p, th, 24))
          .when(Boolean(dot(status, th)), (el) => el.child(div().absolute().top(1).right(1).child(dot(status, th))));
      }));
  }

  render() {
    const th = theme();
    shared("2code.locale"); shared("2code.projects");
    const projects = this.projects();
    const narrow = this.width < RAIL;
    if (this.handle.is_focused() && !this.cursor) {
      const hit = this.navRows(projects).find((r) => r.x?.space?.active);
      this.cursor = hit?.id ?? projects.find((q) => (q.every ?? q.profiles).some((x) => x.space?.active))?.key ?? projects[0]?.key ?? null;
    }
    return v_flex().id("sidebar-root").size_full().min_h(0).bg(th.chrome).text_size(13)
      .track_focus(this.handle)
      .on_key_down((e, cx) => this.key(e, projects, cx))
      .on_mouse_down("left", (_e, cx) => { this.handle.focus(); cx.notify(); })
      .on_mouse_up("left", (_e, cx) => { if (this.drag) { this.drop(projects); cx.notify(); } })
      // Released outside the sidebar: no drop.
      .on_hover((h, cx) => { if (!h && this.drag) { this.drag = this.dropAt = null; cx.notify(); } })
      .on_size_change((size, cx) => { if (Math.abs(size.width - this.width) >= 1) { this.width = size.width; cx.notify(); } })
      .child(h_flex().h(30).px(narrow ? 0 : 16).items_center().when(narrow, (el) => el.justify_center())
        .when(!narrow, (el) => el.justify_between().child(div().text_size(12).text_color(th.dim).child(t("projects"))))
        .child(iconButton("project-new", "plus", th, () => this.addProject(), { iconSize: 14 })))
      .child(narrow ? this.rail(projects, th) : v_flex().id("project-list").flex_1().min_h(0).px(8).gap(1).overflow_y_scrollbar()
        .children(projects.flatMap((p) => this.rows(p, th)))
        .when(!projects.length, (el) => el.child(div().p(8).text_color(th.dim).child(t("noProjects")))));
  }
}

// Settings, pinned to the sidebar's bottom (below the agents list).
export class SidebarFooter {
  render() {
    const th = theme();
    shared("2code.locale");
    const narrow = (find(layout(), "sidebar")?.size?.px ?? 250) < RAIL;
    return v_flex().size_full().justify_center().bg(th.chrome).text_size(13)
      .child(h_flex().id("settings").h(32).mx(8).px(narrow ? 0 : 8).gap(8).items_center().rounded(6).cursor_pointer()
        .when(narrow, (el) => el.justify_center())
        .text_color(th.muted).hover((s) => s.bg(th.hover).text_color(th.foreground))
        .on_click(() => run("app.settings"))
        .child(icon("settings", 15)).when(!narrow, (el) => el.child(t("settings"))));
  }
}

// Herdr's own New worktree dialog makes the checkout; 2code adds the project's
// setup script as the new space's first tab.
export async function openNewProfile(p) {
  const on = p.on ?? p.machine ?? null;
  const config = await readProjectConfig(p.path, on);
  if (config.error) notify({ title: "2code", body: t("configError", { error: config.error }), level: "warning" });
  const setup = config.setup_script.length ? { tab: t("setupTab"), argv: scriptArgv(config.setup_script) } : {};
  openOverlay({ mod: "worktree", kind: "dialog", width: 460, height: 280, props: { folder: p.path, machine: on, action: "new", ...setup } });
}

// Spaces made in the checkout: a shell that only cd'd there isn't closed with it.
const owned = (x) => x.spaces.filter((s) => s.folder === x.path || s.folder?.startsWith(x.path + "/"));

// Deepest checkout holding the folder.
function within(profiles, at) {
  if (!at) return null;
  return profiles.filter((y) => at === y.path || at.startsWith(y.path + "/"))
    .sort((a, b) => b.path.length - a.path.length)[0] ?? null;
}

export function deleteProfile(p, x) {
  openOverlay({ mod: "2code", kind: "dialog", width: 480, height: 340, props: { part: "deleteProfile", main: p.path, top: x.path, branch: x.branch ?? null, spaces: (x.spaces ? owned(x) : x.space ? [x.space] : []).map((s) => s.id), on: p.on ?? p.machine ?? null } });
}
