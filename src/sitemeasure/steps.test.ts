import { describe, expect, it } from 'vitest';
import { produce } from 'immer';
import { buildSeedProject } from '../model/seed';
import { applyStep, buildSteps, parseStepId, viewStep } from './steps';
import { measureWallFace } from '../geometry/dimensions';
import { findOpening } from '../geometry/openings';

const fmt = (mm: number) => `${mm} mm`;

describe('site measure steps', () => {
  const project = buildSeedProject();
  const steps = buildSteps(project);

  it('lists every estimated value on every floor, with stable ids', () => {
    const kinds = new Set(steps.map((s) => s.kind));
    for (const k of ['ceiling', 'elevation', 'wallLength', 'wallThickness', 'openingWidth', 'openingHeight', 'openingSill', 'pin']) {
      expect(kinds.has(k as never), k).toBe(true);
    }
    expect(new Set(steps.map((s) => s.id)).size).toBe(steps.length);
    expect(parseStepId(steps[3].id)).toEqual(steps[3]);
  });

  it('asks plain questions that name the room', () => {
    const views = steps.map((s) => viewStep(project, s)!).filter(Boolean);
    expect(views).toHaveLength(steps.length);
    expect(views.some((v) => /^Kitchen: .*wall.*inside length\?$/.test(v.question))).toBe(true);
    expect(views.some((v) => /^Wall between Kitchen and Reception/.test(v.question))).toBe(true);
    expect(views.some((v) => v.question === 'First floor: ceiling height?')).toBe(true);
    expect(views.some((v) => v.question === 'Dimensions unknown, measure on site.')).toBe(true);
    for (const v of views) expect(v.question).not.toMatch(/node|edge|mesh|undefined/i);
  });

  it('applies a wall length and clears the estimate', () => {
    const step = steps.find((s) => s.kind === 'wallLength' && s.levelId === 'lvl-first')!;
    const next = produce(project, (d) => {
      expect(applyStep(d, step, 3000, fmt)).toBeNull();
    });
    const L = next.levels.find((l) => l.id === 'lvl-first')!;
    expect(measureWallFace(L, step.targetId)).toBeCloseTo(3000, 0);
    expect(L.walls.find((w) => w.id === step.targetId)!.estimated).toBe(false);
  });

  it('records a measured window without making it a new structural opening', () => {
    const step = steps.find((s) => s.kind === 'openingWidth' && s.levelId === 'lvl-first')!;
    const next = produce(project, (d) => {
      expect(applyStep(d, step, 1300, fmt)).toBeNull();
    });
    const o = findOpening(next.levels.find((l) => l.id === step.levelId)!, step.targetId)!.opening;
    expect(o.width).toBe(1300);
    expect(o.existing).toBe(true);
    expect(o.estimated).toBe(false);
  });

  it('refuses silly values with a reason and removes pins', () => {
    const ceiling = steps.find((s) => s.kind === 'ceiling')!;
    produce(project, (d) => {
      expect(applyStep(d, ceiling, 500, fmt)).toMatch(/ceiling height between/);
    });
    const pin = steps.find((s) => s.kind === 'pin')!;
    const next = produce(project, (d) => void applyStep(d, pin, 0, fmt));
    expect(next.levels.find((l) => l.id === pin.levelId)!.markers!.some((m) => m.id === pin.targetId)).toBe(false);
  });
});
