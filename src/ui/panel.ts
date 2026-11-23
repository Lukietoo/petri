import type { App } from "../app";
import { PALETTES } from "../core/palettes";
import { PRESETS, nearestPreset } from "../core/presets";
import { SEED_KINDS } from "../core/seeds";
import type { AppState } from "../core/state";

const $ = <T extends HTMLElement>(sel: string, root: ParentNode = document) => root.querySelector(sel) as T;

function el<K extends keyof HTMLElementTagNameMap>(tag: K, props: Record<string, string> = {}, ...children: (Node | string)[]): HTMLElementTagNameMap[K] {
  const node = Object.assign(document.createElement(tag), props);
  node.append(...children);
  return node;
}

interface Slider {
  key: keyof AppState;
  label: string;
  min: number;
  max: number;
  step: number;
  fmt: (v: number) => string;
}

const SLIDERS: Slider[] = [
  { key: "feed", label: "feed", min: 0.005, max: 0.1, step: 0.0005, fmt: (v) => v.toFixed(4) },
  { key: "kill", label: "kill", min: 0.04, max: 0.075, step: 0.0005, fmt: (v) => v.toFixed(4) },
  { key: "speed", label: "speed", min: 1, max: 40, step: 1, fmt: (v) => `${v}×` },
  { key: "brush", label: "brush", min: 4, max: 80, step: 1, fmt: (v) => `${v}px` },
  { key: "shade", label: "relief", min: 0, max: 1, step: 0.05, fmt: (v) => v.toFixed(2) },
];

export function mountPanel(app: App, toast: (msg: string) => void) {
  const panel = $<HTMLElement>("#panel");

  // presets
  const presetRow = $<HTMLElement>("#presets", panel);
  PRESETS.forEach((p, i) => {
    const b = el("button", { className: "chip", title: `${p.blurb}  [${i + 1}]` }, p.name);
    b.dataset.id = p.id;
    b.onclick = () => app.applyPreset(p.id);
    presetRow.append(b);
  });

  // palettes
  const palRow = $<HTMLElement>("#palettes", panel);
  for (const p of PALETTES) {
    const b = el("button", { className: "swatch", title: p.id });
    b.dataset.id = p.id;
    b.style.background = `linear-gradient(135deg, ${p.stops.join(", ")})`;
    b.onclick = () => app.set({ palette: p.id });
    palRow.append(b);
  }

  // sliders
  const sliderBox = $<HTMLElement>("#sliders", panel);
  const outputs = new Map<keyof AppState, [HTMLInputElement, HTMLOutputElement, Slider]>();
  for (const s of SLIDERS) {
    const input = el("input", { type: "range", min: String(s.min), max: String(s.max), step: String(s.step) });
    const out = el("output");
    input.oninput = () => app.set({ [s.key]: Number(input.value) } as Partial<AppState>);
    sliderBox.append(el("label", {}, el("span", {}, s.label), out, input));
    outputs.set(s.key, [input, out, s]);
  }

  // seeds
  const seedRow = $<HTMLElement>("#seeds", panel);
  for (const k of SEED_KINDS) {
    const b = el("button", { className: "chip ghost" }, k);
    b.onclick = () => app.reseed(k);
    seedRow.append(b);
  }
  const textForm = $<HTMLFormElement>("#text-seed", panel);
  textForm.onsubmit = (e) => {
    e.preventDefault();
    const v = ($<HTMLInputElement>("input", textForm).value || "petri").slice(0, 24);
    app.seedText(v);
  };

  // resolution
  const res = $<HTMLSelectElement>("#resolution", panel);
  res.onchange = () => app.set({ resolution: Number(res.value) });

  // actions
  $<HTMLButtonElement>("#act-map").onclick = () => app.toggleMap();
  $<HTMLButtonElement>("#act-pause").onclick = () => togglePause();
  $<HTMLButtonElement>("#act-snap").onclick = () => snapshot();
  $<HTMLButtonElement>("#act-share").onclick = () => share();
  $<HTMLButtonElement>("#act-collapse").onclick = () => panel.classList.toggle("collapsed");

  function togglePause() {
    app.paused = !app.paused;
    $<HTMLButtonElement>("#act-pause").textContent = app.paused ? "play" : "pause";
  }

  async function snapshot() {
    const blob = await app.snapshot();
    if (!blob) return toast("snapshot failed");
    const a = el("a", { href: URL.createObjectURL(blob), download: `petri-${app.state.palette}-${app.state.seed}.png` });
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 2000);
    toast("saved snapshot");
  }

  async function share() {
    try {
      await navigator.clipboard.writeText(location.href);
      toast("link copied");
    } catch {
      toast("copy the address bar to share");
    }
  }

  function sync(s: AppState) {
    for (const [key, [input, out, def]] of outputs) {
      const v = s[key] as number;
      if (document.activeElement !== input) input.value = String(v);
      out.textContent = def.fmt(v);
    }
    const near = nearestPreset(s.feed, s.kill);
    panel.querySelectorAll<HTMLElement>("#presets .chip").forEach((c) => c.classList.toggle("active", c.dataset.id === near?.id));
    panel.querySelectorAll<HTMLElement>("#palettes .swatch").forEach((c) => c.classList.toggle("active", c.dataset.id === s.palette));
    res.value = String(s.resolution);
    $<HTMLButtonElement>("#act-map").classList.toggle("on", s.map);
    document.body.classList.toggle("map-mode", s.map);
    $<HTMLElement>("#readout").textContent = s.map ? "click anywhere to pick" : near ? near.blurb : "uncharted territory";
    $<HTMLElement>("#seed-label").textContent = `${s.seedKind} · ${s.seed}`;
  }

  app.onChange(sync);
  sync(app.state);

  window.addEventListener("keydown", (e) => {
    const t = e.target as HTMLElement;
    if (t.tagName === "INPUT" || t.tagName === "SELECT" || e.metaKey || e.ctrlKey) return;
    const n = Number(e.key);
    if (n >= 1 && n <= PRESETS.length) app.applyPreset(PRESETS[n - 1].id);
    switch (e.key.toLowerCase()) {
      case " ":
        e.preventDefault();
        togglePause();
        break;
      case "r":
        app.reseed();
        break;
      case "m":
        app.toggleMap();
        break;
      case "s":
        snapshot();
        break;
      case "h":
        document.body.classList.toggle("zen");
        break;
      case "c": {
        const i = PALETTES.findIndex((p) => p.id === app.state.palette);
        app.set({ palette: PALETTES[(i + 1) % PALETTES.length].id });
        break;
      }
    }
  });
}
