import type { Id } from '../model/types';
import type { Placed, RuleContext } from './context';

export type Severity = 'error' | 'warning' | 'tip';
export type Params = Record<string, number>;

export interface Finding {
  itemIds: Id[];
  wallIds?: Id[];
  measured: number;
  required: number;
  ideal?: number;
  /** Set for "flag" findings; omitted for measurements compared with required/ideal. */
  severity?: Severity;
  /** Full message for flags. */
  message?: string;
  /** For measurements: "Double bed to wardrobe" ... */
  subject?: string;
  /** ... and "to get into bed". */
  need?: string;
  /** The item whose room the issue is listed under (defaults to the first item). */
  roomItem?: Placed;
  /** Room name for issues not tied to an item (structural). */
  roomName?: string;
  roomId?: Id;
  /** Distinguishes several findings of one rule on the same items. */
  key?: string;
}

interface RuleBase {
  id: string;
  title: string;
  severity: Severity;
  params: Params;
  /** Plain-language names for the params, shown in settings. */
  paramLabels: Record<string, string>;
  /** Can the fixer try nudging or turning the named items? */
  fixable: boolean;
}

export interface ItemRule extends RuleBase {
  scope: 'item';
  applies: (p: Placed, ctx: RuleContext) => boolean;
  measure: (p: Placed, ctx: RuleContext, params: Params) => Finding[];
}

export interface LevelRule extends RuleBase {
  scope: 'level';
  measureLevel: (ctx: RuleContext, params: Params) => Finding[];
}

export type Rule = ItemRule | LevelRule;
