// Everything the print pages read. PackView builds it once; each page picks what it needs.
import type { Project } from '../../model/types';
import type { UnitSystem } from '../../model/units';
import type { Budget } from '../../model/costs';
import type { VersionMeta } from '../../model/versions';
import type { Comparison, RemovedWall } from '../compare';
import type { FloorSummary, StructuralRow } from '../pack';

export interface PackModel {
  project: Project;
  units: UnitSystem;
  floors: FloorSummary[];
  printableFloors: FloorSummary[];
  rows: StructuralRow[];
  budget: Budget;
  date: string;
  comparison: Comparison | null;
  comparing: boolean;
  removed: RemovedWall[];
  versionLabel: string;
  anyChange: boolean;
  allChanges: { floor: string; text: string }[];
  checklist: string[];
  hasStructural: boolean;
  withNotes: FloorSummary[];
  /** Plan pictures by level id (null = failed). */
  images: Record<string, string | null>;
  /** 3D pictures by key (`after:<level>`, `before:<version>:<level>`). */
  shots: Record<string, string | null>;
  chosenId: string | null;
  chosenMeta: VersionMeta | null;
}
