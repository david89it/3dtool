import { useStore } from '../model/store';
import { exportProjectFile } from '../model/persistence';
import { exportHistory, runJob } from '../model/versions';
import { noteCopySaved } from '../model/copyReminder';
import { useVersionsUi } from './versionsUi';

/** File, Save a copy: write the plan (and its versions, if she ticked that) to a file, and note the time for the reminder. */
export async function saveCopyToFile(): Promise<void> {
  const withVersions = useVersionsUi.getState().includeHistory;
  const history = withVersions ? await runJob('Could not read your versions, so the copy has none.', (kv) => exportHistory(kv)) : undefined;
  exportProjectFile(useStore.getState().project, history);
  noteCopySaved();
}
