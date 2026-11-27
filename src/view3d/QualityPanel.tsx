import { useState } from 'react';
import { useQuality, type Quality } from './quality';
import { PHOTO_WIDTH, takePhoto } from './Photo';

const CHOICES: { id: Quality; label: string; hint: string }[] = [
  { id: 'fast', label: 'Fast', hint: 'Smooth on any iPad or laptop.' },
  { id: 'beautiful', label: 'Beautiful', hint: 'Soft shadows, shaded corners and rounded furniture. Needs a faster device.' },
];

/** Save the file under a name she will recognise; the browser may ask where to put it. */
function download(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

export function QualityPanel({ levelName }: { levelName: string }) {
  const quality = useQuality((s) => s.quality);
  const setQuality = useQuality((s) => s.set);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState('');

  const shoot = async () => {
    setBusy(true);
    setNote('Taking the photo…');
    // Let the note paint before the heavy drawing starts.
    await new Promise((r) => setTimeout(r, 60));
    const blob = await takePhoto(PHOTO_WIDTH[quality], quality === 'beautiful' ? 4 : 0);
    if (blob) {
      download(blob, `${levelName.replace(/[^\w-]+/g, '-').toLowerCase()}-photo.png`);
      setNote('Saved. Check your downloads.');
    } else setNote('Sorry, the photo could not be made on this device. Try Fast quality.');
    setBusy(false);
  };

  return (
    <section className="panel-section" data-testid="quality-panel">
      <h2>Picture quality</h2>
      <div className="segmented" role="radiogroup" aria-label="Picture quality">
        {CHOICES.map((c) => (
          <button key={c.id} role="radio" aria-checked={quality === c.id} className={quality === c.id ? 'on' : ''} title={c.hint} onClick={() => setQuality(c.id)}>
            {c.label}
          </button>
        ))}
      </div>
      <p className="note">{CHOICES.find((c) => c.id === quality)?.hint}</p>
      <button className="btn" disabled={busy} onClick={() => void shoot()} data-testid="photo-button" title="Save a large, high-quality picture of what you see now">
        Save a photo (PNG)
      </button>
      {note && (
        <p className="note" role="status">
          {note}
        </p>
      )}
    </section>
  );
}
