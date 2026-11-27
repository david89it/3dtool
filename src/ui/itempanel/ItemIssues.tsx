import { useLevelIssues } from '../useIssues';
import { IssueCard } from '../AdvicePanel';

/** Layout problems that involve this item (from the same checks as Advice mode). */
export function ItemIssues({ itemId }: { itemId: string }) {
  const issues = useLevelIssues().filter((i) => i.itemIds.includes(itemId));
  return (
    <div className="field column" data-testid="item-issues">
      <span className="field-label">Layout check</span>
      {issues.length === 0 ? (
        <p className="note">No problems with this one.</p>
      ) : (
        <ul className="issue-list">
          {issues.map((i) => (
            <IssueCard key={i.id} issue={i} compact />
          ))}
        </ul>
      )}
    </div>
  );
}
