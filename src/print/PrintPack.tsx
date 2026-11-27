// The engineer and landlord pack: a full-screen view laid out as A4
// landscape pages, with print styles so "Print or save as PDF" gives a clean
// document. It sits outside the editor layout and shares nothing with the
// canvas except canvasApi.renderLevelImage (the plan pictures).
//
// Data comes from the hooks in usePackState.ts; each page is a component in
// ./pages that reads what it needs from one PackModel.

import { lazy, Suspense, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { relativeTime } from '../model/versions';
import { removedWallChecklist } from './compare';
import { usePrint } from './state';
import { usePackModalBehaviour, usePackSnapshot, usePlanImages, usePlanShots, useVersionCompare } from './usePackState';
import { PackToolbar } from './PackToolbar';
import type { PackModel } from './pages/model';
import { CoverPage } from './pages/CoverPage';
import { FloorPlanPages } from './pages/FloorPlanPages';
import { StructuralPage } from './pages/StructuralPage';
import { LandlordPage } from './pages/LandlordPage';
import { View3DPages } from './pages/View3DPages';
import { NotesPage } from './pages/NotesPage';
import { BudgetPage } from './pages/BudgetPage';
import './print.css';

const Offscreen3D = lazy(() => import('../view3d/Offscreen3D').then((m) => ({ default: m.Offscreen3D })));

export function PrintPack() {
  const open = usePrint((s) => s.open);
  if (!open) return null;
  return createPortal(<PackView />, document.body);
}

function PackView() {
  const setOpen = usePrint((s) => s.setOpen);
  const data = usePackSnapshot();
  const { project, floors, rows } = data;
  const printableFloors = useMemo(() => floors.filter((f) => f.hasWalls), [floors]);
  const cmp = useVersionCompare(project);
  const { comparison } = cmp;
  const { images, ready } = usePlanImages(printableFloors, comparison, cmp.ghostKey, cmp.loadingCompare);
  const { shots, shotsPending } = usePlanShots(printableFloors, project, cmp.beforeProject, comparison, cmp.chosenId, cmp.changedKey);
  usePackModalBehaviour(() => setOpen(false));

  const allChanges = floors.flatMap((f) => f.changes.map((c) => ({ floor: f.name, text: c })));
  const removed = comparison?.removedWalls ?? [];
  const anyChange = allChanges.length > 0 || (!!comparison && (removed.length > 0 || comparison.openedUp.length > 0 || comparison.removedOpenings.length > 0));
  const m: PackModel = {
    ...data,
    printableFloors,
    comparison,
    comparing: cmp.comparing,
    removed,
    versionLabel: cmp.chosenMeta ? `${cmp.chosenMeta.name} (${relativeTime(cmp.chosenMeta.createdAt, Date.now())})` : '',
    anyChange,
    allChanges,
    checklist: [...data.checklist, ...removedWallChecklist(comparison)],
    hasStructural: rows.length > 0,
    withNotes: floors.filter((f) => f.notes.length > 0),
    images,
    shots,
    chosenId: cmp.chosenId,
    chosenMeta: cmp.chosenMeta,
  };

  return (
    <div className="print-root" role="dialog" aria-label="Print or save as PDF" data-testid="print-view">
      <PackToolbar
        ready={ready}
        shotsPending={shotsPending}
        metas={cmp.metas}
        ordered={cmp.ordered}
        chosenId={cmp.chosenId}
        onCompare={cmp.setCompareId}
        onClose={() => setOpen(false)}
      />

      {printableFloors.length > 0 && (
        <Suspense fallback={null}>
          <Offscreen3D />
        </Suspense>
      )}

      <div className="print-pages">
        <CoverPage m={m} />
        <FloorPlanPages m={m} />
        <StructuralPage m={m} />
        <LandlordPage m={m} />
        <View3DPages m={m} />
        <NotesPage m={m} />
        <BudgetPage m={m} />
      </div>
    </div>
  );
}
