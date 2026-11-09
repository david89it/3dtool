// Actions shared by the Advice panel and the item panel.

import type { Level } from '../model/types';
import { currentLevel, useStore } from '../model/store';
import type { Issue } from '../rules/engine';
import { applyFix, fixIssue } from '../rules/fixers';
import { computeJoints } from '../geometry/joints';
import { canvasApi } from '../editor2d/canvasApi';
import { highlightPoints } from '../editor2d/layers/HighlightLayer';
import { overridesOf, ruleFmt } from './useIssues';

/** Outline what the issue is about and zoom the plan to it. */
export function showIssue(issue: Issue): void {
  const s = useStore.getState();
  const level = currentLevel();
  if (!level) return;
  const h = { itemIds: issue.itemIds, wallIds: issue.wallIds, issueId: issue.id };
  s.setHighlight(h);
  const pts = highlightPoints(level, s.project, computeJoints(level), h);
  if (pts.length) canvasApi.fitPoints(pts);
}

/** Try the one-click fix. Returns true if something moved. */
export function fixIssueNow(issue: Issue): boolean {
  const s = useStore.getState();
  const level = currentLevel();
  if (!level) return false;
  const fix = fixIssue(level, s.project, issue, { overrides: overridesOf(s.project), fmt: ruleFmt(s.units) });
  if (!fix || fix.moves.length === 0) {
    s.toast('No simple fix: move things by hand.');
    return false;
  }
  s.editLevel(`Fix: ${issue.ruleTitle.toLowerCase()}`, (L) => applyFix(L as Level, fix));
  s.setHighlight({ itemIds: issue.itemIds, wallIds: issue.wallIds });
  s.toast(fix.moves.length === 1 ? 'Moved it to the nearest spot that works. Undo puts it back.' : 'Moved them to the nearest spots that work. Undo puts them back.');
  return true;
}

export { renderAdvice } from './renderAdvice';

export const SEVERITY_LABEL = { error: 'Blocks use', warning: 'Uncomfortable', tip: 'Tip' } as const;

