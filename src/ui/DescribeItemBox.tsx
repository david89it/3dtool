import { isRound } from '../catalogue/catalogue';
import { useMemo, useState } from 'react';
import { useStore } from '../model/store';
import { loadApiKey } from '../advice/keyStore';
import { CATALOGUE, CATEGORY_LABEL } from '../catalogue/items';
import { buildAiItem, classifyLink, cleanUrl, confidenceLabel, splitUrl, type ItemDescription } from '../advice/describeModel';
import { EditableLength } from './EditableLength';
import { ItemPreview } from './FurnishPanel';

type Source = { text?: string; url?: string; kind?: 'image' | 'link' };
type Phase = { kind: 'idle' } | { kind: 'loading' } | { kind: 'error'; message: string } | { kind: 'preview'; desc: ItemDescription; source: Source };

/** Top of the Furnish panel: describe a piece, or paste an image link, and get an item to place. */
export function DescribeItemBox() {
  const enabled = useStore((s) => s.adviceEnabled);
  const keySaved = useStore((s) => s.adviceKeySaved);
  const [text, setText] = useState('');
  const [url, setUrl] = useState('');
  const [phase, setPhase] = useState<Phase>({ kind: 'idle' });

  if (!enabled || !keySaved) {
    return (
      <p className="note describe-hint" data-testid="describe-hint">
        Add your Claude key in Settings to make items from a description or a shop link{' '}
        <button title="Open Settings to add your Claude key" className="link-btn" onClick={() => useStore.getState().setSettingsOpen(true)}>
          Open Settings
        </button>
      </p>
    );
  }

  const run = async () => {
    const split = splitUrl(text);
    const typedUrl = url.trim();
    const link = typedUrl ? cleanUrl(typedUrl) : cleanUrl(split.url);
    if (typedUrl && !link) {
      setPhase({ kind: 'error', message: 'That link does not look right. It should start with https://' });
      return;
    }
    const isPage = !!link && classifyLink(link) === 'page';
    const description = typedUrl ? text.trim() : split.text;
    if (!description && !link) {
      setPhase({ kind: 'error', message: 'Describe the item, for example “tan leather lounge chair”, or paste a shop link.' });
      return;
    }
    setPhase({ kind: 'loading' });
    try {
      const key = await loadApiKey();
      if (!key) throw new Error('No API key saved. Add one in Settings.');
      const { describeItem } = await import('../advice/describeItem');
      const desc = await describeItem(key, { text: description, ...(isPage ? { pageUrl: link } : { imageUrl: link }) });
      setPhase({ kind: 'preview', desc, source: { ...(description ? { text: description } : {}), ...(link ? { url: link, kind: isPage ? ('link' as const) : ('image' as const) } : {}) } });
    } catch (e) {
      setPhase({ kind: 'error', message: (e as Error).message });
    }
  };

  return (
    <section className="describe-box" aria-label="Add an item by description" data-testid="describe-box">
      <label className="field column">
        <span className="field-label">Describe the item</span>
        <textarea
          className="text-field describe-text"
          aria-label="Describe an item"
          rows={2}
          placeholder="Vitra-style lounge chair in tan leather"
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => e.stopPropagation()}
        />
      </label>
      <input
        className="text-field"
        type="url"
        inputMode="url"
        aria-label="Shop link or picture link (optional)"
        placeholder="Shop link or picture link (optional)"
        value={url}
        onChange={(e) => setUrl(e.target.value)}
        onKeyDown={(e) => {
          e.stopPropagation();
          if (e.key === 'Enter') void run();
        }}
      />
      <button className="btn primary wide" disabled={phase.kind === 'loading'} onClick={() => void run()}>
        {phase.kind === 'loading' ? 'Asking Claude…' : 'Add'}
      </button>
      {phase.kind === 'loading' && (
        <p className="note" role="status" data-testid="describe-loading">
          Working out the size and colour… A shop page can take up to a minute.
        </p>
      )}
      {phase.kind === 'error' && (
        <p className="error" role="alert">
          {phase.message}
        </p>
      )}
      {phase.kind === 'preview' && (
        <PreviewCard
          desc={phase.desc}
          source={phase.source}
          onChange={(desc) => setPhase({ kind: 'preview', desc, source: phase.source })}
          onRetry={() => void run()}
          onDone={() => {
            setPhase({ kind: 'idle' });
            setText('');
            setUrl('');
          }}
        />
      )}
    </section>
  );
}

function PreviewCard({
  desc,
  source,
  onChange,
  onRetry,
  onDone,
}: {
  desc: ItemDescription;
  source: Source;
  onChange: (d: ItemDescription) => void;
  onRetry: () => void;
  onDone: () => void;
}) {
  const base = CATALOGUE.find((c) => c.id === desc.baseItemId);
  const round = !!base && isRound(base);
  const item = useMemo(() => buildAiItem(desc, source, 'ai-preview'), [desc, source]);

  const setDim = (axis: 'w' | 'd' | 'h', mm: number) => onChange({ ...desc, dims: { ...desc.dims, [axis]: Math.round(mm) } });
  const add = () => {
    const real = buildAiItem(desc, source);
    useStore.getState().commit(`Add “${real.name}” from a description`, (draft) => {
      draft.catalogueOverrides.push(real);
    });
    useStore.getState().toast(`“${real.name}” added. Find it under Your items.`);
    onDone();
  };

  return (
    <div className="describe-card" data-testid="describe-preview">
      <div className="row">
        <ItemPreview item={item} size={56} />
        <div className="describe-title">
          <input
            className="text-field"
            aria-label="Item name"
            value={desc.name}
            onChange={(e) => onChange({ ...desc, name: e.target.value })}
            onKeyDown={(e) => e.stopPropagation()}
          />
          <span className="note">
            {CATEGORY_LABEL[desc.category]}
            {desc.material ? ` · ${desc.material}` : ''}
          </span>
        </div>
      </div>
      {(['w', 'd', 'h'] as const).filter((axis) => !round || axis !== 'd').map((axis) => {
        const label = round && axis === 'w' ? 'Diameter' : axis === 'w' ? 'Width' : axis === 'd' ? 'Depth' : 'Height';
        return (
          <div className="field" key={axis}>
            <span className="field-label">{label}</span>
            <EditableLength
              label={`New item ${label.toLowerCase()}`}
              ctx="small"
              value={desc.dims[axis]}
              min={50}
              max={6000}
              onChange={(mm) => (round && axis === 'w' ? onChange({ ...desc, dims: { ...desc.dims, w: Math.round(mm), d: Math.round(mm) } }) : setDim(axis, mm))}
            />
          </div>
        );
      })}
      <div className="field">
        <span className="field-label">Colour</span>
        <span className="value describe-colour">
          <span className="swatch-chip" style={{ background: desc.colorHex ?? '#c7d5ea' }} aria-hidden />
          {desc.colorHex ?? 'Not chosen'}
        </span>
      </div>
      <div className="field">
        <span className="field-label">Shape</span>
        <span className="value" data-testid="describe-base">
          {base ? `Like the ${base.name.toLowerCase()}` : 'A plain box'}
        </span>
      </div>
      <p className={desc.sizeConfidence === 'guess' ? 'note warn' : 'note'}>
        {desc.sizeConfidence === 'guess' ? '? ' : ''}
        {confidenceLabel(desc.sizeConfidence, source.kind === 'link' ? 'link' : 'description')}.{desc.notes ? ` ${desc.notes}` : ''}
      </p>
      {item.price !== undefined && (
        <div className="field">
          <span className="field-label">Price</span>
          <span className="value" data-testid="describe-price">
            £{item.price} (from the shop page)
          </span>
        </div>
      )}
      <div className="actions">
        <button className="btn primary" disabled={!desc.name.trim()} onClick={add}>
          Add to my items
        </button>
        <button title="Ask Claude again" className="btn" onClick={onRetry}>
          Try again
        </button>
      </div>
    </div>
  );
}
