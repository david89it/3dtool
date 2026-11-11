// The actions the search palette (Ctrl/⌘ K) offers, in plain words. Each does what the
// button or menu item of the same name does.

import { useStore, type Mode } from '../model/store';
import { useVersionsUi } from './versionsUi';
import { useBudgetUi } from './budgetUi';
import { usePrint } from '../print/state';
import { useSiteMeasure } from '../sitemeasure/state';
import { toggleThreeD } from './modeToggle';

export interface PaletteCommand {
  id: string;
  label: string;
  /** Other words she might type for it. */
  keywords: string[];
  run: () => void;
}

const MODE_COMMANDS: { mode: Mode; label: string; keywords: string[] }[] = [
  { mode: 'trace', label: 'Go to Trace', keywords: ['walls', 'draw', 'plan image', 'rooms'] },
  { mode: 'openings', label: 'Go to Openings', keywords: ['doors', 'windows', 'knock through'] },
  { mode: 'furnish', label: 'Go to Furnish', keywords: ['furniture', 'catalogue', 'items'] },
  { mode: 'advice', label: 'Go to Advice', keywords: ['check', 'layout problems', 'rules'] },
  { mode: '3d', label: 'Go to 3D', keywords: ['walk', 'view'] },
];

export function paletteCommands(): PaletteCommand[] {
  const s = () => useStore.getState();
  return [
    { id: 'cmd:undo', label: 'Undo', keywords: ['back', 'step back'], run: () => s().undo() },
    { id: 'cmd:redo', label: 'Redo', keywords: ['forward'], run: () => s().redo() },
    { id: 'cmd:versions', label: 'Versions', keywords: ['save a copy', 'restore', 'history', 'snapshot'], run: () => useVersionsUi.getState().setOpen(true) },
    { id: 'cmd:budget', label: 'Budget and shopping list', keywords: ['cost', 'price', 'money', 'spend'], run: () => useBudgetUi.getState().setOpen(true) },
    { id: 'cmd:print', label: 'Print or save as PDF', keywords: ['pack', 'engineer', 'landlord', 'export'], run: () => usePrint.getState().setOpen(true) },
    { id: 'cmd:measure', label: 'Measure on site', keywords: ['checklist', 'visit', 'tape'], run: () => useSiteMeasure.getState().setOpen(true) },
    { id: 'cmd:scan', label: 'Import a scan', keywords: ['lidar', 'roomplan', 'dxf', 'usdz'], run: () => useSiteMeasure.getState().setImportOpen(true) },
    { id: 'cmd:settings', label: 'Settings', keywords: ['preferences', 'rules', 'api key', 'advice'], run: () => s().setSettingsOpen(true) },
    { id: 'cmd:shortcuts', label: 'Show shortcuts', keywords: ['keyboard', 'keys', 'help'], run: () => s().setShortcutsOpen(true) },
    { id: 'cmd:3d', label: 'Toggle 3D', keywords: ['switch', 'plan', 'walk'], run: () => toggleThreeD() },
    ...MODE_COMMANDS.map((m) => ({ id: `cmd:mode-${m.mode}`, label: m.label, keywords: m.keywords, run: () => s().setMode(m.mode) })),
  ];
}
