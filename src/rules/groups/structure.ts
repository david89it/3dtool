// Structure, fire escape and loft headroom.
import type { Vec2 } from '../../model/types';
import { needsStructuralBadge, STRUCTURAL_BADGE_TEXT } from '../../geometry/openings';
import { activeLevelsResolved, groupOf } from '../../model/schemes';
import { blockedBedrooms, buildEscapeGraph, escapeGeometry, escapeWords, kitchensOntoRoute, newKitchenJoins } from '../escape';
import { heightAt, resolveSlopes } from '../../geometry/roof';
import type { Finding, Rule } from '../types';
import { has, name, lname } from '../helpers';

export const structureRules: Rule[] = [
  {
    id: 'structural-opening',
    title: 'Structural openings',
    scope: 'level',
    severity: 'warning',
    fixable: false,
    params: {},
    paramLabels: {},
    measureLevel: (ctx) =>
      ctx.level.walls.filter(needsStructuralBadge).map((w) => {
        const rooms = ctx.roomsOfWall(w.id);
        return {
          itemIds: [],
          wallIds: [w.id],
          measured: w.openings.filter((o) => !o.existing).length,
          required: 0,
          severity: 'warning' as const,
          message: STRUCTURAL_BADGE_TEXT,
          roomName: rooms.map((r) => r.name).join(' / ') || 'Walls',
          roomId: rooms[0]?.room?.id,
          key: w.id,
        };
      }),
  },
  {
    id: 'fire-escape',
    title: 'Way out in a fire',
    scope: 'level',
    severity: 'warning',
    fixable: false,
    params: { on: 1 },
    paramLabels: { on: 'Check the way out from bedrooms (1 = on, 0 = off)' },
    measureLevel: (ctx, { on }) => {
      if (on < 0.5) return [];
      // Guidance only: see DECISIONS.md "Fire escape". Uses every floor showing, so a
      // bedroom upstairs is traced down the stairs to the front door.
      const all = ctx.project.levels ? activeLevelsResolved({ levels: ctx.project.levels, activeSchemes: ctx.project.activeSchemes }) : [];
      const group = groupOf(ctx.level);
      const levels = [...all.filter((l) => l.id !== ctx.level.id && groupOf(l) !== group), ctx.level];
      const g = buildEscapeGraph(levels, ctx.project, (l) => (l === ctx.level ? ctx.geo : escapeGeometry(l)));
      const out: Finding[] = [];
      const ground = Math.min(...levels.map((l) => l.elevation));
      const high = ctx.level.elevation - ground > 4500;
      for (const { node, kitchen } of blockedBedrooms(g, ctx.level.id)) {
        out.push({
          itemIds: [],
          measured: 1,
          required: 0,
          severity: 'warning',
          message:
            `The way out from ${node.name} goes through ${escapeWords(kitchen)}. In a flat this usually needs a fire door, a heat alarm and a protected route, or sprinklers. Ask Building Control. ` +
            `Ways to fix it: keep a protected hall with fire doors between the bedroom and the kitchen; or move the cooking away from the way out; or fit a mains-wired heat alarm in the kitchen and smoke alarms along the route; or a sprinkler or mist system (BS 8458 or BS 9251) designed by a fire engineer.` +
            (high ? ' This floor is more than 4.5 m up, which makes the rules stricter.' : '') +
            ' This is guidance, not a compliance check.',
          roomName: node.name,
          roomId: node.roomId,
          key: node.id,
        });
      }
      for (const { edge, kitchen, other } of newKitchenJoins(g, ctx.level.id)) {
        out.push({
          itemIds: [],
          wallIds: edge.wallId ? [edge.wallId] : [],
          measured: 1,
          required: 0,
          severity: 'tip',
          message:
            `This new opening joins ${escapeWords(kitchen)} to ${other.outside ? 'the hall or stairs' : other.name}. ` +
            `If anyone has to pass the cooking to get out, a fire door, a heat alarm or sprinklers may be needed. Ask Building Control. This is guidance, not a compliance check.`,
          roomName: kitchen.name,
          roomId: kitchen.roomId,
          key: edge.openingId,
        });
      }
      for (const j of kitchensOntoRoute(g, ctx.level.id)) {
        const stairs = j.hall.outside || /stair/i.test(j.hall.name);
        const where = stairs ? 'the stairs' : 'the hall';
        const isDoor = j.joint === 'door';
        out.push({
          itemIds: [],
          wallIds: [...new Set(j.edges.flatMap((e) => (e.wallId ? [e.wallId] : [])))],
          measured: 1,
          required: 0,
          severity: isDoor ? 'tip' : 'warning',
          message:
            `The ${j.kitchen.openPlan || !isDoor ? 'open kitchen' : 'kitchen'} opens onto ${where}, which ${stairs ? 'are' : 'is'} the way out from the bedrooms. A fire in the kitchen could block ${stairs ? 'them' : 'it'}. ` +
            `This usually needs a fire door between them (FD30, self-closing) or a protected hall. Ask Building Control.` +
            (isDoor ? ' The joining opening is a door, which may already be a fire door: check it is.' : ' The joining opening has no door.') +
            ' This is guidance, not a compliance check.',
          roomName: j.kitchen.name,
          roomId: j.kitchen.roomId,
          key: `kitchen-onto-route:${j.hall.id}`,
        });
      }
      if (!g.entranceFound && ctx.level.rooms.some((r) => /bed/i.test(r.name))) {
        out.push({
          itemIds: [],
          measured: 1,
          required: 0,
          severity: 'tip',
          message: 'The front door of the flat is not marked, so the way out from the bedrooms is not checked. Select the door and tick "Front door of the flat".',
          roomName: 'Walls',
          key: 'no-entrance',
        });
      }
      return out;
    },
  },
  {
    id: 'loft-headroom',
    title: 'Headroom',
    scope: 'item',
    severity: 'warning',
    fixable: false,
    params: { margin: 50, bedHead: 1300, standing: 1800 },
    paramLabels: {
      margin: 'Space to leave under the ceiling',
      bedHead: 'Ceiling height over the head of a bed (to sit up)',
      standing: 'Ceiling height where you stand at a cupboard or worktop',
    },
    applies: (p) => has(p, 'loft-headroom') && p.cat.mount !== 'ceiling',
    measure: (p, ctx, { margin, bedHead, standing }) => {
      const { room, detected } = ctx.roomOf(p);
      const flat = room?.ceilingHeight ?? ctx.level.ceilingHeight;
      // Under a sloped roof the ceiling is lower toward the wall: use the real height at each spot.
      const slopes = resolveSlopes(ctx.level, room, detected);
      const heightAtPoint = (pt: Vec2) => heightAt(slopes, flat, pt);
      const [bl, br, fr, fl] = p.poly;
      const mid = (a: Vec2, b: Vec2): Vec2 => ({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 });
      const spots = [bl, br, fr, fl, mid(bl, br), mid(br, fr), mid(fr, fl), mid(fl, bl), p.centre];
      const lowest = Math.min(...spots.map(heightAtPoint));
      const out: Finding[] = [];
      if (p.top > lowest - margin) {
        out.push({
          itemIds: [p.item.id],
          measured: p.top,
          required: lowest - margin,
          severity: 'warning',
          message: slopes.length
            ? `${name(p)} is ${ctx.fmt(p.top)} tall, but the sloping ceiling above it comes down to ${ctx.fmt(lowest)} at its lowest edge. It will not fit there.`
            : `${name(p)} is ${ctx.fmt(p.top)} tall and the ceiling here is ${ctx.fmt(flat)}. It may not fit, especially where the roof slopes.`,
          roomItem: p,
        });
      }
      if (slopes.length && p.cat.category === 'sleep') {
        // Sitting up in bed: the ceiling over the pillow end.
        const head = mid(bl, br);
        const over = heightAtPoint({ x: head.x + p.front.x * 300, y: head.y + p.front.y * 300 });
        out.push({
          itemIds: [p.item.id],
          measured: over,
          required: bedHead,
          ideal: bedHead + 200,
          subject: `Ceiling over the head of the ${lname(p)}`,
          need: 'to sit up in bed without bumping your head',
          roomItem: p,
          key: 'bed-head',
        });
      }
      if (slopes.length && ['storage', 'kitchen', 'bath', 'utility'].includes(p.cat.category)) {
        // Standing in front of it to use it.
        const fc = mid(fl, fr);
        const at = heightAtPoint({ x: fc.x + p.front.x * 450, y: fc.y + p.front.y * 450 });
        out.push({
          itemIds: [p.item.id],
          measured: at,
          required: standing,
          subject: `Ceiling where you stand at the ${lname(p)}`,
          need: 'to stand up straight to use it',
          roomItem: p,
          key: 'standing',
        });
      }
      return out;
    },
  },
];
