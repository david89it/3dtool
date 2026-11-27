import type { Level, PlacedItem } from '../model/types';
import { useStore } from '../model/store';
import { findCatalogueItem, itemParts } from '../catalogue/catalogue';
import { FINISHABLE } from '../catalogue/colors';
import { ItemHeader } from './itempanel/ItemHeader';
import { SizeFields } from './itempanel/SizeFields';
import { TurnFields } from './itempanel/TurnFields';
import { ClearanceList } from './itempanel/ClearanceList';
import { ItemActions } from './itempanel/ItemActions';
import { ItemIssues } from './itempanel/ItemIssues';
import { ModuleFields } from './itempanel/ModuleFields';
import { SurroundFields } from './itempanel/SurroundFields';
import { FinishPicker } from './itempanel/FinishPicker';
import { ItemSource } from './itempanel/ItemSource';
import { CostSection } from './itempanel/CostSection';

export function ItemPanel({ level, itemId }: { level: Level; itemId: string }) {
  const project = useStore((s) => s.project);
  const editLevel = useStore((s) => s.editLevel);
  const item = level.items.find((i) => i.id === itemId);
  const cat = item ? findCatalogueItem(project, item.catalogueId) : undefined;
  if (!item || !cat) return null;

  const change = (label: string, fn: (i: PlacedItem) => PlacedItem) =>
    editLevel(label, (L) => {
      const idx = L.items.findIndex((x) => x.id === itemId);
      if (idx >= 0) L.items[idx] = fn(L.items[idx] as PlacedItem);
    });

  const name = cat.name.toLowerCase();

  return (
    <div className="panel-section" data-testid="item-panel">
      <ItemHeader level={level} item={item} cat={cat} change={change} name={name} />

      {cat.source && <ItemSource source={cat.source} />}

      {cat.builder === 'modules' && <ModuleFields item={item} change={change} locked={!!item.locked} />}

      {cat.builder === 'opening-surround' && <SurroundFields level={level} item={item} change={change} locked={!!item.locked} />}

      <SizeFields item={item} cat={cat} change={change} name={name} />

      <FinishPicker item={item} change={change} name={name} hasFinish={itemParts(item, cat).some((p) => FINISHABLE.has(p.colorToken))} />

      <TurnFields item={item} name={name} change={change} />

      <ClearanceList cat={cat} />

      <CostSection item={item} change={change} name={name} />

      <ItemIssues itemId={itemId} />

      <ItemActions item={item} cat={cat} />
    </div>
  );
}
