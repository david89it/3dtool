// Development-only render counters, for measuring how many times each part of
// the screen draws while she drags or hovers. In a production build
// `import.meta.env.DEV` is false and every call is removed.
//
//   window.__renders  { PlanCanvas: 12, ItemShape: 1800, ... }
//   window.__renderReset()  start counting from zero

type Counters = Record<string, number>;

export function countRender(name: string): void {
  if (!import.meta.env.DEV) return;
  const w = window as unknown as { __renders?: Counters; __renderReset?: () => void };
  if (!w.__renders) {
    w.__renders = {};
    w.__renderReset = () => {
      w.__renders = {};
    };
  }
  w.__renders[name] = (w.__renders[name] ?? 0) + 1;
}
