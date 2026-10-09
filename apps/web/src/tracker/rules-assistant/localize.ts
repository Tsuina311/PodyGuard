import type { LocalizedText } from './types';

export function pickLocalized(
  text: LocalizedText,
  locale: string,
): { text: string; locale: string; fallback: boolean } {
  const code = locale.toLowerCase().slice(0, 2);
  if (code === 'fr' && text.fr) {
    return { text: text.fr, locale: 'fr', fallback: false };
  }
  return {
    text: text.en,
    locale: 'en',
    fallback: code !== 'en',
  };
}
