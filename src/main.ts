import { Sim } from "./gl/sim";

const canvas = document.getElementById("stage") as HTMLCanvasElement;
const sim = new Sim(canvas);

const SCALE = 0.5;
canvas.width = innerWidth;
canvas.height = innerHeight;
const w = Math.round(innerWidth * SCALE);
const h = Math.round(innerHeight * SCALE);

// seed a few square blobs of B in the middle
const seed = new Float32Array(w * h * 4);
for (let i = 0; i < w * h; i++) seed[i * 4] = 1;
for (let n = 0; n < 20; n++) {
  const cx = Math.floor(w / 2 + (Math.random() - 0.5) * w * 0.3);
  const cy = Math.floor(h / 2 + (Math.random() - 0.5) * h * 0.3);
  for (let y = -4; y <= 4; y++)
    for (let x = -4; x <= 4; x++) seed[((cy + y) * w + cx + x) * 4 + 1] = 1;
}
sim.reset(w, h, seed);

const stops = new Float32Array([0.02, 0.03, 0.06, 0.1, 0.2, 0.4, 0.2, 0.7, 0.8, 0.8, 0.95, 0.9, 1, 1, 1]);
const params = { feed: 0.0545, kill: 0.062, diffA: 1, diffB: 0.5, dt: 1, map: false };

function frame() {
  sim.step(params, { x: 0, y: 0, radius: 0, mode: 0 }, 12);
  sim.draw(stops, 0.8);
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
