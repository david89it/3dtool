import type { Project } from '../../model/types';
import { useStore } from '../../model/store';
import { activeLevels, groupOf } from '../../model/schemes';
import { OptionSwitcher } from '../OptionSwitcher';

export function FloorTabs({ project }: { project: Project }) {
  const levelId = useStore((s) => s.levelId);
  const setLevel = useStore((s) => s.setLevel);
  const current = project.levels.find((l) => l.id === levelId);
  const currentGroup = current ? groupOf(current) : '';
  return (
    <div className="topbar-floors">
    <nav className="levels" aria-label="Floors">
      {activeLevels(project).map((l) => {
        const on = groupOf(l) === currentGroup;
        return (
          <button
            key={groupOf(l)}
            className={on ? 'level-tab on' : 'level-tab'}
            aria-pressed={on}
            title={`Show ${l.name}`}
            onClick={() => setLevel(l.id)}
          >
            {l.name}
            {l.scheme && <span className="tab-option"> · {l.scheme.name}</span>}
          </button>
        );
      })}
    </nav>
    <OptionSwitcher />
    </div>
  );
}
