import "./style.css";
import { App } from "./app";
import { decodeState, encodeState } from "./core/state";
import { mountPanel } from "./ui/panel";

const canvas = document.getElementById("stage") as HTMLCanvasElement;
const toastEl = document.getElementById("toast")!;

function toast(msg: string) {
  toastEl.textContent = msg;
  toastEl.classList.add("show");
  clearTimeout((toast as unknown as { t: number }).t);
  (toast as unknown as { t: number }).t = window.setTimeout(() => toastEl.classList.remove("show"), 1800);
}

function fail(message: string) {
  document.body.classList.add("failed");
  document.getElementById("error")!.textContent = message;
}

try {
  const app = new App(canvas, decodeState(location.hash));
  mountPanel(app, toast);

  let hashTimer: number | undefined;
  app.onChange((s) => {
    clearTimeout(hashTimer);
    hashTimer = window.setTimeout(() => history.replaceState(null, "", "#" + encodeState(s)), 250);
  });
  history.replaceState(null, "", "#" + encodeState(app.state));

  // fps meter
  const fpsEl = document.getElementById("fps")!;
  let last = performance.now();
  let lastFrames = 0;
  setInterval(() => {
    const now = performance.now();
    fpsEl.textContent = String(Math.round(((app.frames - lastFrames) * 1000) / (now - last)));
    last = now;
    lastFrames = app.frames;
  }, 500);

  const loop = () => {
    app.frame();
    requestAnimationFrame(loop);
  };
  requestAnimationFrame(loop);
  document.body.classList.add("ready");

  if (import.meta.env.DEV) (window as unknown as { petri: App }).petri = app;
} catch (err) {
  console.error(err);
  fail(err instanceof Error ? err.message : String(err));
}
