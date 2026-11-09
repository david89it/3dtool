// Optional "Ask for advice" (brief phase 4). Sends the current floor and the
// rule results to the Claude API from the browser, with a key she pastes in
// Settings. The key is stored only in this browser (IndexedDB) and sent only
// to api.anthropic.com. Rules work fully offline without any of this.

import Anthropic from '@anthropic-ai/sdk';
import { del, get, set } from 'idb-keyval';
import type { Level, Project } from '../model/types';
import { detectRooms } from '../geometry/rooms';
import { computeJoints } from '../geometry/joints';
import { findCatalogueItem, effectiveDims } from '../catalogue/catalogue';
import { OPENING_LABEL } from '../geometry/openings';
import { wallLength } from '../geometry/wallGraph';

const KEY_STORE = 'flatplan:anthropic-key';
const ENABLED_STORE = 'flatplan:advice-enabled';

export const ADVICE_MODEL = 'claude-opus-5-5';

export async function loadApiKey(): Promise<string | undefined> {
  try {
    return await get<string>(KEY_STORE);
  } catch {
    return undefined;
  }
}
export async function saveApiKey(key: string): Promise<void> {
  await set(KEY_STORE, key.trim());
}
export async function forgetApiKey(): Promise<void> {
  await del(KEY_STORE);
}
export async function loadAdviceEnabled(): Promise<boolean> {
  try {
    return (await get<boolean>(ENABLED_STORE)) ?? false;
  } catch {
    return false;
  }
}
export async function saveAdviceEnabled(v: boolean): Promise<void> {
  await set(ENABLED_STORE, v);
}

/** Facts the rules engine measured; the model must not contradict them. */
export interface RuleFact {
  severity: 'error' | 'warning' | 'tip';
  roomName?: string;
  message: string;
}

/** Plain, compact description of one floor for the model (millimetres). */
export function serialiseLevel(level: Level, project: Project): string {
  const J = computeJoints(level);
  const rooms = detectRooms(level, J).filter((r) => !r.solid);
  const lines: string[] = [];
  lines.push(`Floor: ${level.name}. Ceiling height ${level.ceilingHeight} mm. All sizes in mm; plan x runs across the building, y from the rear (garden) to the front (street).`);
  lines.push('Rooms:');
  for (const r of level.rooms) {
    const d = rooms.find((x) => x.nodeIds.join('|') === r.boundary.join('|'));
    if (!d) continue;
    const xs = d.inner.map((p) => p.x);
    const ys = d.inner.map((p) => p.y);
    lines.push(
      `- ${r.name}: ${(d.area / 1e6).toFixed(1)} m², spans x ${Math.round(Math.min(...xs))}–${Math.round(Math.max(...xs))}, y ${Math.round(Math.min(...ys))}–${Math.round(Math.max(...ys))}${r.floorFinish ? `, floor ${r.floorFinish}` : ''}`,
    );
  }
  lines.push('Walls (with openings):');
  for (const w of level.walls) {
    const a = level.nodes.find((n) => n.id === w.a)!.pos;
    const b = level.nodes.find((n) => n.id === w.b)!.pos;
    const ops = w.openings
      .map((o) => `${OPENING_LABEL[o.type].toLowerCase()} ${o.width} wide at ${Math.round(o.offset)} from the first end${o.sill ? `, sill ${o.sill}` : ''}${o.existing ? '' : ' (new)'}`)
      .join('; ');
    lines.push(
      `- ${w.kind} wall ${Math.round(wallLength(level, w))} long, ${w.thickness} thick, from (${Math.round(a.x)}, ${Math.round(a.y)}) to (${Math.round(b.x)}, ${Math.round(b.y)}), structure: ${w.structural}${ops ? `; ${ops}` : ''}`,
    );
  }
  lines.push('Furniture:');
  if (level.items.length === 0) lines.push('- none yet');
  for (const it of level.items) {
    const cat = findCatalogueItem(project, it.catalogueId);
    if (!cat) continue;
    const d = effectiveDims(it, cat);
    lines.push(
      `- ${cat.name}${it.state ? ` (${it.state})` : ''}: ${Math.round(d.w)} × ${Math.round(d.d)} × ${Math.round(d.h)}, centre (${Math.round(it.pos.x)}, ${Math.round(it.pos.y)}), turned ${Math.round(it.rotationDeg)}°${it.locked ? ', locked' : ''}`,
    );
  }
  return lines.join('\n');
}

const SYSTEM = `You are an experienced UK interior designer helping a couple plan a Victorian conversion flat in London (leasehold).
You get one floor of their plan as text, plus layout checks a rules engine has already measured.
The measured values are facts: never contradict them, never invent other measurements, and say when something can't be judged from the data.
Suggest practical layout improvements: what to move, where, and why, using the room and furniture names given.
Keep to the UK context: any change to a load-bearing or "unknown" wall needs a structural engineer, Building Control and the landlord's licence; carpets are required by the lease outside the kitchen and bathroom.
Write plain language for a designer, not an engineer. Use short headed sections per room and at most 8 suggestions overall, most useful first. No preamble.`;

export interface AdviceResult {
  text: string;
  servedBy: string;
}

/**
 * Ask Claude for suggestions. Throws an Error with a plain-language message
 * when the key is wrong, the network fails or the request is declined.
 */
export async function askForAdvice(apiKey: string, level: Level, project: Project, facts: RuleFact[], question?: string): Promise<AdviceResult> {
  const client = new Anthropic({ apiKey, dangerouslyAllowBrowser: true });
  const factText = facts.length
    ? facts.map((f) => `- [${f.severity}]${f.roomName ? ` ${f.roomName}:` : ''} ${f.message}`).join('\n')
    : '- No problems found by the checks.';
  const content = `<plan>\n${serialiseLevel(level, project)}\n</plan>\n\n<measured_checks>\n${factText}\n</measured_checks>\n\n${question?.trim() ? `Their question: ${question.trim()}` : 'What would you change to make this floor work better?'}`;
  try {
    const response = await client.beta.messages.create({
      model: ADVICE_MODEL,
      max_tokens: 16000,
      betas: ['server-side-fallback-2026-07-01'],
      fallbacks: 'default',
      output_config: { effort: 'medium' },
      system: SYSTEM,
      messages: [{ role: 'user', content }],
    });
    if (response.stop_reason === 'refusal') {
      throw new Error('Claude declined to answer this one. Try rephrasing your question.');
    }
    const text = response.content
      .filter((b): b is Anthropic.Beta.BetaTextBlock => b.type === 'text')
      .map((b) => b.text)
      .join('\n')
      .trim();
    if (!text) throw new Error('Claude returned an empty answer. Try again.');
    return { text, servedBy: response.model };
  } catch (err) {
    if (err instanceof Anthropic.AuthenticationError) throw new Error('That API key was not accepted. Check it in Settings.');
    if (err instanceof Anthropic.PermissionDeniedError) throw new Error('This API key is not allowed to use that model.');
    if (err instanceof Anthropic.RateLimitError) throw new Error('Too many requests just now. Wait a minute and try again.');
    if (err instanceof Anthropic.APIConnectionError) throw new Error('Could not reach Claude. Check your internet connection.');
    if (err instanceof Anthropic.APIError) throw new Error(`Claude returned an error (${err.status}). Try again in a moment.`);
    throw err;
  }
}
