import type { CatalogueItem } from '../../model/types';

const SOURCE_NOTE = {
  stated: 'The size is as described.',
  typical: 'The size is a typical one for this kind of item.',
  guess: 'The size is a rough guess, so check it against the real thing.',
} as const;

/** Where an item made from a description came from, and how sure its size is. */
export function ItemSource({ source }: { source: NonNullable<CatalogueItem['source']> }) {
  const link = source.url && /^https?:\/\//i.test(source.url) ? source.url : undefined;
  return (
    <div className="item-source" data-testid="item-source">
      <p className="note">
        {source.kind === 'link' ? 'Made from a shop link' : source.kind === 'image' ? 'Made from an image link' : 'Made from your description'}
        {source.text ? `: “${source.text}”` : ''}.{' '}
        {source.kind === 'link' && source.sizeConfidence === 'stated' ? 'Sizes from the shop page.' : (SOURCE_NOTE[source.sizeConfidence as keyof typeof SOURCE_NOTE] ?? 'Sizes are estimates.')}
      </p>
      {link && (
        <a href={link} target="_blank" rel="noopener noreferrer" className="source-link">
          {source.kind === 'link' ? 'Open the shop page' : 'Open the image link'}
        </a>
      )}
    </div>
  );
}
