import { exec, window, appHome } from "herdr";
import * as fs from "fs/promises";
import { git } from "./git.js";
import { CACHE } from "./ui.js";

const platform = () => window()?.platform ?? "linux";

// Opens a folder in Finder / Explorer / the file manager, or a file in its
// default app (this computer only).
export async function openPath(path) {
  const p = platform();
  if (p === "macos") return exec("open", [path]);
  if (p === "windows") return exec("explorer.exe", [path.replace(/\//g, "\\")]);
  return exec("xdg-open", [path]);
}

// The GitHub owner of a checkout's origin, or null.
export async function githubOwner(path, on) {
  const r = await git(path, ["remote", "get-url", "origin"], on);
  const m = r.ok && /github\.com[:/]+([^/]+)\//i.exec(r.out);
  return m ? m[1] : null;
}

// A GitHub avatar, downloaded once into the mod's hidden cache (Herdr draws
// images only from its own folder, and hidden files don't reload the mod).
// Resolves with the path for image(), or null.
export async function githubAvatar(owner) {
  if (!owner || !/^[A-Za-z0-9-]+$/.test(owner)) return null;
  const dir = `${appHome()}/${CACHE}/avatars`;
  const rel = `${CACHE}/avatars/${owner.toLowerCase()}.png`, abs = `${appHome()}/${rel}`;
  if (await fs.exists(abs).catch(() => false)) return rel;
  try {
    // fetch() only reads text, so the picture comes down with curl (also on Windows 10+).
    await fs.mkdir(dir, { recursive: true }).catch(() => {});
    const r = await exec("curl", ["-fsSL", "--max-time", "15", "-o", abs, `https://avatars.githubusercontent.com/${owner}?s=64&v=4`]);
    return r.code === 0 ? rel : null;
  } catch {
    return null;
  }
}
