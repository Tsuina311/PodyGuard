import { SUPPORTED_LOCALES, type AppLocale } from '../../i18n/locales';

/** BCP-47 tags for the Web Speech API. Recognition is not on-device by default. */
const SPEECH_TAGS: Record<AppLocale, string> = {
  en: 'en-US',
  de: 'de-DE',
  fr: 'fr-FR',
  es: 'es-ES',
  it: 'it-IT',
  pt: 'pt-PT',
  nl: 'nl-NL',
  pl: 'pl-PL',
  sv: 'sv-SE',
  da: 'da-DK',
  no: 'nb-NO',
  fi: 'fi-FI',
  cs: 'cs-CZ',
  sk: 'sk-SK',
  hu: 'hu-HU',
  ro: 'ro-RO',
  el: 'el-GR',
  hr: 'hr-HR',
  sl: 'sl-SI',
  bg: 'bg-BG',
  uk: 'uk-UA',
  lt: 'lt-LT',
  lv: 'lv-LV',
  et: 'et-EE',
  is: 'is-IS',
  ga: 'ga-IE',
  mt: 'mt-MT',
  sr: 'sr-RS',
  sq: 'sq-AL',
  bs: 'bs-BA',
  mk: 'mk-MK',
  be: 'be-BY',
  ca: 'ca-ES',
  eu: 'eu-ES',
  cy: 'cy-GB',
};

export function speechLanguageTag(locale: string | undefined): string {
  const code = locale?.toLowerCase().slice(0, 2) ?? 'en';
  if (code in SPEECH_TAGS) {
    return SPEECH_TAGS[code as AppLocale];
  }
  return 'en-US';
}

export function speechLanguageOptions(): Array<{
  locale: AppLocale;
  tag: string;
  label: string;
}> {
  return SUPPORTED_LOCALES.map((locale) => ({
    locale: locale.code,
    tag: SPEECH_TAGS[locale.code],
    label: locale.nativeLabel,
  }));
}
