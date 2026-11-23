/**
 * Named regions of the Gray-Scott (feed, kill) parameter space.
 * Values follow the classic Pearson / Munafo catalogues for Da = 1.0, Db = 0.5.
 */
export interface Preset {
  id: string;
  name: string;
  feed: number;
  kill: number;
  blurb: string;
}

export const PRESETS: readonly Preset[] = [
  { id: "coral", name: "Coral", feed: 0.0545, kill: 0.062, blurb: "branching growth that fills the dish" },
  { id: "mitosis", name: "Mitosis", feed: 0.0367, kill: 0.0649, blurb: "spots that grow and divide like cells" },
  { id: "maze", name: "Maze", feed: 0.029, kill: 0.057, blurb: "labyrinths and fingerprints" },
  { id: "spots", name: "Spots", feed: 0.03, kill: 0.062, blurb: "stable solitons, leopard print" },
  { id: "worms", name: "Worms", feed: 0.078, kill: 0.061, blurb: "short wriggling segments" },
  { id: "holes", name: "Holes", feed: 0.039, kill: 0.058, blurb: "negative spots punched in a sheet" },
  { id: "waves", name: "Waves", feed: 0.014, kill: 0.054, blurb: "pulsing, travelling fronts" },
  { id: "chaos", name: "Chaos", feed: 0.026, kill: 0.051, blurb: "turbulent, never settles" },
  { id: "uskate", name: "U-Skate", feed: 0.062, kill: 0.0609, blurb: "gliders on the edge of stability" },
];

export function presetById(id: string): Preset | undefined {
  return PRESETS.find((p) => p.id === id);
}

/** Find the preset whose (feed, kill) is closest to the given point, if within tolerance. */
export function nearestPreset(feed: number, kill: number, tolerance = 0.0015): Preset | undefined {
  let best: Preset | undefined;
  let bestD = Infinity;
  for (const p of PRESETS) {
    const d = Math.hypot(p.feed - feed, p.kill - kill);
    if (d < bestD) {
      bestD = d;
      best = p;
    }
  }
  return bestD <= tolerance ? best : undefined;
}
