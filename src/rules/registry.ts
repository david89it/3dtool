// The rules registry (brief §5). One file, data-driven, easy to extend: see
// README "How to add a rule".
//
// An item rule applies to a placed item when the catalogue item lists the
// rule id in its `rules` array (and any extra condition in `applies`).
// A level rule looks at the whole floor (door swings, walkways, structure).
//
// Rules return Findings. A finding with a `severity` is always reported
// with that severity ("flag" rules). Otherwise it is a measurement: below
// `required` it is reported at the rule's severity, between `required` and
// `ideal` it is a tip, at or above `ideal` it is fine and dropped.

import type { Rule } from './types';
import { bedroomRules } from './groups/bedroom';
import { circulationRules } from './groups/circulation';
import { kitchenRules } from './groups/kitchen';
import { livingRules } from './groups/living';
import { bathroomRules } from './groups/bathroom';
import { structureRules } from './groups/structure';

export type { Severity, Params, Finding, ItemRule, LevelRule, Rule } from './types';

// Order matters: it is the order rules run and are listed in settings.
export const RULES: Rule[] = [
  ...bedroomRules,
  ...circulationRules,
  ...kitchenRules,
  ...livingRules,
  ...bathroomRules,
  ...structureRules,
];

export const RULES_BY_ID = new Map(RULES.map((r) => [r.id, r]));
