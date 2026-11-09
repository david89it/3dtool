import { useMemo } from 'react';
import type { Level, Project } from '../model/types';
import { useLevel, useStore } from '../model/store';
import { runRules, type Issue } from '../rules/engine';
import type { Fmt, RuleOverrides } from '../rules/context';
import { formatLength, type UnitSystem } from '../model/units';

const NO_OVERRIDES: RuleOverrides = {};
const FMT_CACHE = new Map<UnitSystem, Fmt>();

/** One formatter per unit system, so the rules memo stays warm. */
export function ruleFmt(units: UnitSystem): Fmt {
  let f = FMT_CACHE.get(units);
  if (!f) {
    f = (mm: number) => formatLength(mm, units, mm < 1000 ? 'small' : 'length');
    FMT_CACHE.set(units, f);
  }
  return f;
}

export function overridesOf(project: Project): RuleOverrides {
  return (project.ruleOverrides as RuleOverrides | undefined) ?? NO_OVERRIDES;
}

/** Issues for a level, with her units and rule settings. */
export function issuesFor(level: Level, project: Project, units: UnitSystem): Issue[] {
  return runRules(level, project, { overrides: overridesOf(project), fmt: ruleFmt(units) });
}

/** Layout issues on the floor she is looking at. Re-runs on every change. */
export function useLevelIssues(): Issue[] {
  const level = useLevel();
  const project = useStore((s) => s.project);
  const units = useStore((s) => s.units);
  return useMemo(() => (level ? issuesFor(level, project, units) : []), [level, project, units]);
}
