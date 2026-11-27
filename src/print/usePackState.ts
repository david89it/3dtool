// Hooks that feed the print pack: the plan snapshot, the version to compare
// with, the 2D plan pictures and the 3D pictures.
import { useEffect, useMemo, useState } from 'react';
import { useStore } from '../model/store';
import { canvasApi } from '../editor2d/canvasApi';
import { renderOverview3D } from '../view3d/captureBridge';
import { readIndex, getResolvedVersion, runJob, type VersionMeta } from '../model/versions';
import { validateProject } from '../model/persistence';
import type { Project } from '../model/types';
import { buildBudget } from '../model/costs';
import { compareProjects, defaultVersionId, ghostOutlines, orderVersions, type Comparison } from './compare';
import { buildFloors, buildStructuralRows, engineerChecklist, type FloorSummary } from './pack';
import { usePrint } from './state';

/** Logical size of each plan picture; sharpened by PIXEL_RATIO. Matches the page's picture area. */
export const IMG_W = 1040;
export const IMG_H = 560;
const PIXEL_RATIO = 2.5;

/** The pack shows the plan as it was when she opened it. */
export function usePackSnapshot() {
  const [data] = useState(() => {
    const s = useStore.getState();
    const project = s.project;
    const units = s.units;
    const rows = buildStructuralRows(project);
    return {
      project,
      units,
      floors: buildFloors(project, units),
      budget: buildBudget(project),
      rows,
      checklist: engineerChecklist(rows, units),
      date: new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' }),
    };
  });
  return data;
}

/** Which saved version to compare with, and what changed against it. */
export function useVersionCompare(project: Project) {
  const compareId = usePrint((s) => s.compareId);
  const setCompareId = usePrint((s) => s.setCompareId);
  const [metas, setMetas] = useState<VersionMeta[] | null>(null);
  useEffect(() => {
    let cancelled = false;
    void runJob('Could not read your versions.', (kv) => readIndex(kv), { quiet: true }).then((m) => {
      if (!cancelled) setMetas(m ?? []);
    });
    return () => {
      cancelled = true;
    };
  }, []);
  const ordered = useMemo(() => orderVersions(metas ?? []), [metas]);
  const chosenId = useMemo(() => {
    if (!metas) return null;
    const want = compareId === undefined ? defaultVersionId(metas) : compareId;
    return want && metas.some((m) => m.id === want) ? want : null;
  }, [metas, compareId]);
  const chosenMeta = metas?.find((m) => m.id === chosenId) ?? null;

  // The chosen version's plan, loaded when the choice changes. `loaded` says which choice it answers.
  const [before, setBefore] = useState<{ id: string | null; project: Project | null }>({ id: null, project: null });
  useEffect(() => {
    if (!chosenId) {
      setBefore({ id: null, project: null });
      return;
    }
    let cancelled = false;
    void runJob('Could not read that version.', (kv) => getResolvedVersion(kv, chosenId), { quiet: true }).then((found) => {
      if (cancelled) return;
      let p: Project | null = null;
      try {
        p = found ? validateProject(found.version.project) : null;
      } catch {
        p = null;
      }
      setBefore({ id: chosenId, project: p });
    });
    return () => {
      cancelled = true;
    };
  }, [chosenId]);
  const beforeProject = before.id === chosenId ? before.project : null;
  const comparing = !!chosenId && !!beforeProject;
  const comparison = useMemo(() => (beforeProject ? compareProjects(beforeProject, project) : null), [beforeProject, project]);
  const loadingCompare = !metas || (!!chosenId && before.id !== chosenId);
  const ghostKey = comparison ? comparison.removedWalls.map((w) => w.wallId).join(',') : '';
  const changedKey = comparison ? comparison.changedLevelIds.join(',') : '';
  return { metas, ordered, chosenId, chosenMeta, setCompareId, beforeProject, comparing, comparison, loadingCompare, ghostKey, changedKey };
}

/** Plan pictures (2D), drawn one after another so the page stays responsive. */
export function usePlanImages(printableFloors: FloorSummary[], comparison: Comparison | null, ghostKey: string, loadingCompare: boolean) {
  const [images, setImages] = useState<Record<string, string | null>>({});
  const ready = printableFloors.every((f) => f.levelId in images) && !loadingCompare;
  useEffect(() => {
    if (loadingCompare) return;
    let cancelled = false;
    setImages({});
    (async () => {
      for (const f of printableFloors) {
        const url = await canvasApi.renderLevelImage(f.levelId, {
          width: IMG_W,
          height: IMG_H,
          pixelRatio: PIXEL_RATIO,
          ghostWalls: ghostOutlines(comparison, f.levelId),
        });
        if (cancelled) return;
        setImages((prev) => ({ ...prev, [f.levelId]: url }));
      }
    })().catch(() => {
      if (!cancelled) setImages(Object.fromEntries(printableFloors.map((f) => [f.levelId, null])));
    });
    return () => {
      cancelled = true;
    };
    // comparison is summarised by ghostKey so a new object with the same walls does not redraw
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [printableFloors, ghostKey, loadingCompare]);
  return { images, ready };
}

/**
 * 3D pictures: the plan now for every floor, and the version for floors that changed.
 * Drawn by an offscreen renderer (Offscreen3D), one at a time. A failure leaves a short note, never blocks printing.
 */
export function usePlanShots(
  printableFloors: FloorSummary[],
  project: Project,
  beforeProject: Project | null,
  comparison: Comparison | null,
  chosenId: string | null,
  changedKey: string,
) {
  const [shots, setShots] = useState<Record<string, string | null>>({});
  useEffect(() => {
    let cancelled = false;
    (async () => {
      for (const f of printableFloors) {
        const url = await renderOverview3D({ project, levelId: f.levelId });
        if (cancelled) return;
        setShots((prev) => ({ ...prev, [`after:${f.levelId}`]: url }));
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [printableFloors, project]);
  useEffect(() => {
    if (!beforeProject || !comparison) return;
    let cancelled = false;
    (async () => {
      for (const f of printableFloors) {
        if (!comparison.changedLevelIds.includes(f.levelId)) continue;
        const url = await renderOverview3D({ project: beforeProject, levelId: f.levelId });
        if (cancelled) return;
        setShots((prev) => ({ ...prev, [`before:${chosenId}:${f.levelId}`]: url }));
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [printableFloors, beforeProject, changedKey]);
  const shotsPending =
    printableFloors.some((f) => !(`after:${f.levelId}` in shots)) ||
    (comparison?.changedLevelIds ?? []).some(
      (id) => printableFloors.some((f) => f.levelId === id) && !(`before:${chosenId}:${id}` in shots),
    );
  return { shots, shotsPending };
}

/** The page behind must not scroll or react while the pack is open; Esc closes it. */
export function usePackModalBehaviour(close: () => void) {
  useEffect(() => {
    document.body.classList.add('print-open');
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') close();
    };
    window.addEventListener('keydown', onKey);
    return () => {
      document.body.classList.remove('print-open');
      window.removeEventListener('keydown', onKey);
    };
  }, [close]);
}
