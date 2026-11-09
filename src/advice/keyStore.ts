// Settings for the optional Claude advice, kept only in this browser.
// Split from claudeAdvice.ts so the Anthropic SDK loads only when she asks.

import { del, get, set } from 'idb-keyval';

export const ADVICE_MODEL = 'claude-opus-5-5';

const KEY_STORE = 'flatplan:anthropic-key';
const ENABLED_STORE = 'flatplan:advice-enabled';

export async function loadApiKey(): Promise<string | undefined> {
  try {
    return await get<string>(KEY_STORE);
  } catch {
    return undefined;
  }
}
export async function saveApiKey(key: string): Promise<void> {
  await set(KEY_STORE, key.trim());
}
export async function forgetApiKey(): Promise<void> {
  await del(KEY_STORE);
}
export async function loadAdviceEnabled(): Promise<boolean> {
  try {
    return (await get<boolean>(ENABLED_STORE)) ?? false;
  } catch {
    return false;
  }
}
export async function saveAdviceEnabled(v: boolean): Promise<void> {
  await set(ENABLED_STORE, v);
}

