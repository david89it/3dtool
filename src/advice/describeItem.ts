// "Describe a piece" (Furnish mode). Sends a short description, and optionally
// an image link, to Claude and gets back a sized, coloured catalogue item.
// Uses the same client setup as claudeAdvice.ts: the user's own key, from the
// browser, with the same model and server-side fallback. Loaded only when she
// asks, like claudeAdvice.ts; schema, validation and item building are in
// describeModel.ts and re-exported here.
//
// A shop page link is opened by Claude's server-side web fetch tool, and the
// sizes printed on the page are used as stated. Sizes are estimates otherwise.
// When an image link is given, Anthropic's API fetches it
// from the URL (not this browser), so no CORS problem and no image is stored.

import Anthropic from '@anthropic-ai/sdk';
import { ADVICE_MODEL } from './keyStore';
import { cleanUrl, describeSchema, validateDescription, type DescribeInput, type ItemDescription } from './describeModel';
export * from './describeModel';

const SYSTEM = `You are an expert UK interior designer sizing furniture realistically for a London flat.
The person describes a piece, or shows a photo of one, and you return a catalogue entry for a floor-plan tool.
Use dimensions that are stated in the description or on the shop page. Otherwise use typical UK retail sizes for that kind of piece, and say so with sizeConfidence "typical", or "guess" if you are unsure.
Pick baseItemId from the allowed list: the existing item whose footprint and shape is closest, so the plan and 3D view look right.
All sizes are in millimetres. Width is left to right facing the piece, depth is front to back, height is floor to top.
Choose the main colour of the piece as a lowercase hex value.
Never invent brand claims, prices, or product details you cannot see or were not told. A "Vitra-style" chair is a style, not the real product.`;

export const FETCH_FAILED = 'That shop page could not be opened (some shops block automatic reading). Paste the picture link instead, or type the sizes into the description.';
const MAX_TURNS = 3;

/** Minimal shape of the client, so tests can pass a mock. */
export interface DescribeClient {
  beta: { messages: { create: (params: any) => Promise<Anthropic.Beta.BetaMessage> } };
}

/** The request for a shop page: Claude fetches it and reads the stated sizes. */
export function pagePrompt(pageUrl: string, text: string): string {
  return `Fetch this shop product page with the web fetch tool: ${pageUrl}
Read the product name, the stated product dimensions (width x depth x height, often in cm: convert to millimetres), the main colour or material, and the price if it is clearly shown in pounds (£).
Use the dimensions printed on the page and set sizeConfidence to "stated". If the page gives no dimensions, use typical sizes and say "typical". Never invent a price: use null if it is not clearly stated.${text ? `\n\nExtra notes from the person: ${text}` : ''}`;
}

/** Plain-words errors for API failures, shared by both kinds of request. */
function friendly(err: unknown, hadImage: boolean, hadPage: boolean): Error | unknown {
  if (err instanceof Anthropic.AuthenticationError) return new Error('That API key was not accepted. Check it in Settings.');
  if (err instanceof Anthropic.PermissionDeniedError) return new Error('This API key is not allowed to use that model.');
  if (err instanceof Anthropic.RateLimitError) return new Error('Too many requests just now. Wait a minute and try again.');
  if (err instanceof Anthropic.APIConnectionError) return new Error('Could not reach Claude. Check your internet connection.');
  if (err instanceof Anthropic.BadRequestError && hadImage) {
    return new Error('Claude could not open that image link. Use the address of the picture itself (it usually ends in .jpg or .png), or describe the item in words.');
  }
  if (err instanceof Anthropic.BadRequestError && hadPage) return new Error(FETCH_FAILED);
  if (err instanceof Anthropic.APIError) return new Error(`Claude returned an error (${err.status}). Try again in a moment.`);
  return err;
}

/** The text of the LAST text block: with tools, earlier ones are commentary. */
export function lastText(content: Anthropic.Beta.BetaContentBlock[]): string {
  const texts = content.filter((b): b is Anthropic.Beta.BetaTextBlock => b.type === 'text');
  return (texts[texts.length - 1]?.text ?? '').trim();
}

/** What the fetch tool did in these blocks. */
function fetchOutcome(content: Anthropic.Beta.BetaContentBlock[]): { failed: boolean; ok: boolean } {
  let failed = false;
  let ok = false;
  for (const b of content) {
    if (b.type !== 'web_fetch_tool_result') continue;
    const c = b.content as { type?: string; error_code?: string };
    if (c && (c.error_code || c.type === 'web_fetch_tool_result_error')) failed = true;
    else ok = true;
  }
  return { failed, ok };
}

function parseAnswer(out: string): ItemDescription {
  if (!out) throw new Error('Claude returned an empty answer. Try again.');
  let parsed: unknown;
  try {
    parsed = JSON.parse(out.replace(/^```(?:json)?\s*|\s*```$/g, ''));
  } catch {
    throw new Error('Claude sent back something this tool could not read. Try again.');
  }
  return validateDescription(parsed);
}

/**
 * Ask Claude to size and colour a piece. Throws an Error with a plain message
 * when the key is wrong, the network fails, the link cannot be read or
 * the request is declined. `client` is for tests.
 */
export async function describeItem(apiKey: string, input: DescribeInput, client?: DescribeClient): Promise<ItemDescription> {
  const api: DescribeClient = client ?? (new Anthropic({ apiKey, dangerouslyAllowBrowser: true }) as unknown as DescribeClient);
  const text = input.text.trim();
  const pageUrl = cleanUrl(input.pageUrl);
  const imageUrl = pageUrl ? undefined : cleanUrl(input.imageUrl);
  const base = {
    model: ADVICE_MODEL,
    max_tokens: pageUrl ? 4000 : 2000,
    betas: ['server-side-fallback-2026-07-01'],
    fallbacks: 'default',
    output_config: { effort: 'low', format: { type: 'json_schema', schema: describeSchema() } },
    system: SYSTEM,
  };
  try {
    if (pageUrl) {
      // Citations are left off: they cannot be combined with output_config.format.
      const tools = [{ type: 'web_fetch_20260209', name: 'web_fetch', max_uses: 3 }];
      const messages: Anthropic.Beta.BetaMessageParam[] = [{ role: 'user', content: [{ type: 'text', text: pagePrompt(pageUrl, text) }] }];
      let failed = false;
      let ok = false;
      for (let turn = 0; turn < MAX_TURNS; turn++) {
        const response = await api.beta.messages.create({ ...base, tools, messages });
        if (response.stop_reason === 'refusal') throw new Error('Claude declined to describe this one. Try rephrasing it.');
        const o = fetchOutcome(response.content);
        failed ||= o.failed;
        ok ||= o.ok;
        if (response.stop_reason === 'pause_turn' && turn < MAX_TURNS - 1) {
          messages.push({ role: 'assistant', content: response.content as unknown as Anthropic.Beta.BetaContentBlockParam[] });
          continue;
        }
        if (failed && !ok) throw new Error(FETCH_FAILED);
        return parseAnswer(lastText(response.content));
      }
      throw new Error(FETCH_FAILED);
    }
    const prompt = `${text ? `The piece: ${text}` : 'Describe and size the piece in the photo.'}${imageUrl ? '\n\nThe photo shows the piece. Take the colour and shape from it. Sizes are not visible in a photo, so unless they are stated above, use typical sizes for this kind of piece.' : ''}`;
    const content: Anthropic.Beta.BetaContentBlockParam[] = [];
    if (imageUrl) content.push({ type: 'image', source: { type: 'url', url: imageUrl } });
    content.push({ type: 'text', text: prompt });
    const response = await api.beta.messages.create({ ...base, messages: [{ role: 'user', content }] });
    if (response.stop_reason === 'refusal') throw new Error('Claude declined to describe this one. Try rephrasing it.');
    return parseAnswer(lastText(response.content));
  } catch (err) {
    throw friendly(err, !!imageUrl, !!pageUrl);
  }
}
