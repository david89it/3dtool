// "Describe a piece" (Furnish mode). Sends a short description, and optionally
// an image link, to Claude and gets back a sized, coloured catalogue item.
// Uses the same client setup as claudeAdvice.ts: the user's own key, from the
// browser, with the same model and server-side fallback. Loaded only when she
// asks, like claudeAdvice.ts; schema, validation and item building are in
// describeModel.ts and re-exported here.
//
// Sizes are estimates. When an image link is given, Anthropic's API fetches it
// from the URL (not this browser), so no CORS problem and no image is stored.

import Anthropic from '@anthropic-ai/sdk';
import { ADVICE_MODEL } from './keyStore';
import { cleanUrl, describeSchema, validateDescription, type DescribeInput, type ItemDescription } from './describeModel';
export * from './describeModel';

const SYSTEM = `You are an expert UK interior designer sizing furniture realistically for a London flat.
The person describes a piece, or shows a photo of one, and you return a catalogue entry for a floor-plan tool.
Use dimensions that are stated in the description. Otherwise use typical UK retail sizes for that kind of piece, and say so with sizeConfidence "typical", or "guess" if you are unsure.
Pick baseItemId from the allowed list: the existing item whose footprint and shape is closest, so the plan and 3D view look right.
All sizes are in millimetres. Width is left to right facing the piece, depth is front to back, height is floor to top.
Choose the main colour of the piece as a lowercase hex value.
Never invent brand claims, prices, or product details you cannot see or were not told. A "Vitra-style" chair is a style, not the real product.`;

/**
 * Ask Claude to size and colour a piece. Throws an Error with a plain message
 * when the key is wrong, the network fails, the image link cannot be read or
 * the request is declined.
 */
export async function describeItem(apiKey: string, input: DescribeInput): Promise<ItemDescription> {
  const client = new Anthropic({ apiKey, dangerouslyAllowBrowser: true });
  const text = input.text.trim();
  const imageUrl = cleanUrl(input.imageUrl);
  const prompt = `${text ? `The piece: ${text}` : 'Describe and size the piece in the photo.'}${imageUrl ? '\n\nThe photo shows the piece. Take the colour and shape from it. Sizes are not visible in a photo, so unless they are stated above, use typical sizes for this kind of piece.' : ''}`;
  const content: Anthropic.Beta.BetaContentBlockParam[] = [];
  if (imageUrl) content.push({ type: 'image', source: { type: 'url', url: imageUrl } });
  content.push({ type: 'text', text: prompt });
  try {
    const response = await client.beta.messages.create({
      model: ADVICE_MODEL,
      max_tokens: 2000,
      betas: ['server-side-fallback-2026-07-01'],
      fallbacks: 'default',
      output_config: { effort: 'low', format: { type: 'json_schema', schema: describeSchema() } },
      system: SYSTEM,
      messages: [{ role: 'user', content }],
    });
    if (response.stop_reason === 'refusal') {
      throw new Error('Claude declined to describe this one. Try rephrasing it.');
    }
    const out = response.content
      .filter((b): b is Anthropic.Beta.BetaTextBlock => b.type === 'text')
      .map((b) => b.text)
      .join('')
      .trim();
    if (!out) throw new Error('Claude returned an empty answer. Try again.');
    let parsed: unknown;
    try {
      parsed = JSON.parse(out.replace(/^```(?:json)?\s*|\s*```$/g, ''));
    } catch {
      throw new Error('Claude sent back something this tool could not read. Try again.');
    }
    return validateDescription(parsed);
  } catch (err) {
    if (err instanceof Anthropic.AuthenticationError) throw new Error('That API key was not accepted. Check it in Settings.');
    if (err instanceof Anthropic.PermissionDeniedError) throw new Error('This API key is not allowed to use that model.');
    if (err instanceof Anthropic.RateLimitError) throw new Error('Too many requests just now. Wait a minute and try again.');
    if (err instanceof Anthropic.APIConnectionError) throw new Error('Could not reach Claude. Check your internet connection.');
    if (err instanceof Anthropic.BadRequestError && imageUrl) {
      throw new Error('Claude could not open that image link. Use the address of the picture itself (it usually ends in .jpg or .png), or describe the piece in words.');
    }
    if (err instanceof Anthropic.APIError) throw new Error(`Claude returned an error (${err.status}). Try again in a moment.`);
    throw err;
  }
}
