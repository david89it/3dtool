import { describe, expect, it } from 'vitest';
import { newPlacedItem } from '../catalogue/catalogue';
import { buildAiItem, classifyLink, confidenceLabel, validateDescription } from './describeModel';
import { describeItem } from './describeItem';

const good = {
  name: 'Tan leather lounge chair',
  aliases: ['lounge chair'],
  category: 'sit',
  baseItemId: 'armchair',
  dims: { w: 850, d: 880, h: 800 },
  mount: 'floor',
  colorHex: '#b5793f',
  material: 'tan leather',
  sizeConfidence: 'typical',
  notes: '',
};

describe('classifyLink', () => {
  it('treats picture addresses as images, query strings allowed', () => {
    for (const u of ['https://x.com/a.jpg', 'https://x.com/a.JPEG?w=300', 'https://x.com/a.png', 'https://x.com/a.webp#z', 'https://x.com/a.gif', 'https://i.pinimg.com/736x/ab/cd/ef']) {
      expect(classifyLink(u), u).toBe('image');
    }
  });
  it('treats shop pages as pages and junk as invalid', () => {
    expect(classifyLink('https://www.ikea.com/gb/en/p/kivik-sofa-12345/')).toBe('page');
    expect(classifyLink('https://www.johnlewis.com/p/123.html?x=a.jpg')).toBe('page');
    expect(classifyLink('ftp://x.com/a.jpg')).toBe('invalid');
    expect(classifyLink('chair')).toBe('invalid');
    expect(classifyLink(undefined)).toBe('invalid');
  });
});

const msg = (content: any[], stop = 'end_turn') => ({ content, stop_reason: stop }) as any;
const JSON_TEXT = (o: object) => ({ type: 'text', text: JSON.stringify(o) });
const PAGE_ANSWER = { ...good, dims: { w: 1000, d: 780, h: 880 }, sizeConfidence: 'stated', price: 349 };
const okFetch = { type: 'web_fetch_tool_result', tool_use_id: 't1', content: { type: 'web_fetch_result', url: 'u', content: {} } };
const badFetch = { type: 'web_fetch_tool_result', tool_use_id: 't1', content: { type: 'web_fetch_tool_result_error', error_code: 'url_not_accessible' } };
const mock = (...replies: any[]) => {
  const calls: any[] = [];
  const client = {
    beta: {
      messages: {
        create: async (p: any) => {
          calls.push(structuredClone(p));
          return replies.shift();
        },
      },
    },
  };
  return { client, calls };
};
const URL1 = 'https://www.ikea.com/gb/en/p/armchair-123/';

describe('describeItem with a shop page', () => {
  it('sends the web fetch tool, the URL in the prompt, structured output and no citations', async () => {
    const { client, calls } = mock(msg([JSON_TEXT(PAGE_ANSWER)]));
    await describeItem('k', { text: '', pageUrl: URL1 }, client);
    const p = calls[0];
    expect(p.tools).toEqual([{ type: 'web_fetch_20260209', name: 'web_fetch', max_uses: 3 }]);
    expect(p.messages[0].content[0].text).toContain(URL1);
    expect(p.messages[0].content[0].text).toMatch(/millimetres/);
    expect(p.output_config.format.type).toBe('json_schema');
    expect(p.model).toBe('claude-opus-5-5');
    expect(p.betas).toEqual(['server-side-fallback-2026-07-01']);
    expect(p.fallbacks).toBe('default');
    expect(JSON.stringify(p)).not.toContain('citations');
  });
  it('loops on pause_turn with the assistant content appended, at most 3 times', async () => {
    const paused = msg([{ type: 'text', text: 'working' }, okFetch], 'pause_turn');
    const { client, calls } = mock(paused, paused, msg([JSON_TEXT(PAGE_ANSWER)]));
    const d = await describeItem('k', { text: '', pageUrl: URL1 }, client);
    expect(calls).toHaveLength(3);
    expect(calls[1].messages).toHaveLength(2);
    expect(calls[1].messages[1].role).toBe('assistant');
    expect(calls[2].messages).toHaveLength(3);
    expect(d.dims).toEqual({ w: 1000, d: 780, h: 880 });
    const forever = mock(paused, paused, paused, paused);
    await expect(describeItem('k', { text: '', pageUrl: URL1 }, forever.client)).rejects.toThrow();
    expect(forever.calls).toHaveLength(3);
  });
  it('reports a failed fetch in plain words', async () => {
    const { client } = mock(msg([badFetch, { type: 'text', text: 'Sorry, I could not open it.' }]));
    await expect(describeItem('k', { text: '', pageUrl: URL1 }, client)).rejects.toThrow(/shop page could not be opened.*picture link/);
  });
  it('takes the JSON from the last text block', async () => {
    const { client } = mock(msg([{ type: 'text', text: 'Let me fetch that.' }, okFetch, { type: 'text', text: 'Here you go' }, JSON_TEXT(PAGE_ANSWER)]));
    const d = await describeItem('k', { text: '', pageUrl: URL1 }, client);
    expect(d.sizeConfidence).toBe('stated');
    expect(d.price).toBe(349);
  });
  it('uses an image block, not the tool, for a picture link', async () => {
    const { client, calls } = mock(msg([JSON_TEXT(good)]));
    await describeItem('k', { text: 'chair', imageUrl: 'https://x.com/a.jpg' }, client);
    expect(calls[0].tools).toBeUndefined();
    expect(calls[0].messages[0].content[0].type).toBe('image');
  });
});

describe('shop page items', () => {
  const desc = validateDescription(PAGE_ANSWER);
  const item = buildAiItem(desc, { url: URL1, kind: 'link' }, 'ai-p');
  it('keeps the page as a link source, with the price and stated sizes', () => {
    expect(item.source).toEqual({ kind: 'link', url: URL1, sizeConfidence: 'stated' });
    expect(item.price).toBe(349);
    expect(item.defaultDims).toEqual({ w: 1000, d: 780, h: 880 });
  });
  it('fills the placed item link and price', () => {
    const placed = newPlacedItem(item, { x: 0, y: 0 });
    expect(placed.link).toBe(URL1);
    expect(placed.price).toBe(349);
  });
  it('never takes a bad price', () => {
    expect(validateDescription({ ...good, price: -5 }).price).toBeUndefined();
    expect(validateDescription({ ...good, price: null }).price).toBeUndefined();
  });
  it('says "Sizes from the shop page" only for a shop link', () => {
    expect(confidenceLabel('stated', 'link')).toBe('Sizes from the shop page');
    expect(confidenceLabel('stated', 'description')).toMatch(/described/);
    expect(confidenceLabel('typical', 'link')).toMatch(/typical/);
    expect(confidenceLabel('guess')).toMatch(/guess/);
  });
});
