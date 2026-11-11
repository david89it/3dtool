// Switching between the plan and 3D (Tab, and the search palette), remembering
// which plan mode to come back to.

import { useStore, type Mode } from '../model/store';

/** The 2D mode to return to when leaving 3D. */
let last2DMode: Mode = 'trace';

export function toggleThreeD(): void {
  const s = useStore.getState();
  if (s.mode === '3d') s.setMode(last2DMode);
  else {
    last2DMode = s.mode;
    s.setMode('3d');
  }
}
