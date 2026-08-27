export const SUPPORTED_LOCALES = [
  { code: 'en', label: 'English', nativeLabel: 'English', flag: '🇬🇧' },
  { code: 'de', label: 'German', nativeLabel: 'Deutsch', flag: '🇩🇪' },
  { code: 'fr', label: 'French', nativeLabel: 'Français', flag: '🇫🇷' },
  { code: 'es', label: 'Spanish', nativeLabel: 'Español', flag: '🇪🇸' },
  { code: 'it', label: 'Italian', nativeLabel: 'Italiano', flag: '🇮🇹' },
  { code: 'pt', label: 'Portuguese', nativeLabel: 'Português', flag: '🇵🇹' },
  { code: 'nl', label: 'Dutch', nativeLabel: 'Nederlands', flag: '🇳🇱' },
  { code: 'pl', label: 'Polish', nativeLabel: 'Polski', flag: '🇵🇱' },
  { code: 'sv', label: 'Swedish', nativeLabel: 'Svenska', flag: '🇸🇪' },
  { code: 'da', label: 'Danish', nativeLabel: 'Dansk', flag: '🇩🇰' },
  { code: 'no', label: 'Norwegian', nativeLabel: 'Norsk', flag: '🇳🇴' },
  { code: 'fi', label: 'Finnish', nativeLabel: 'Suomi', flag: '🇫🇮' },
  { code: 'cs', label: 'Czech', nativeLabel: 'Čeština', flag: '🇨🇿' },
  { code: 'sk', label: 'Slovak', nativeLabel: 'Slovenčina', flag: '🇸🇰' },
  { code: 'hu', label: 'Hungarian', nativeLabel: 'Magyar', flag: '🇭🇺' },
  { code: 'ro', label: 'Romanian', nativeLabel: 'Română', flag: '🇷🇴' },
  { code: 'el', label: 'Greek', nativeLabel: 'Ελληνικά', flag: '🇬🇷' },
  { code: 'hr', label: 'Croatian', nativeLabel: 'Hrvatski', flag: '🇭🇷' },
  { code: 'sl', label: 'Slovenian', nativeLabel: 'Slovenščina', flag: '🇸🇮' },
  { code: 'bg', label: 'Bulgarian', nativeLabel: 'Български', flag: '🇧🇬' },
  { code: 'uk', label: 'Ukrainian', nativeLabel: 'Українська', flag: '🇺🇦' },
  { code: 'lt', label: 'Lithuanian', nativeLabel: 'Lietuvių', flag: '🇱🇹' },
  { code: 'lv', label: 'Latvian', nativeLabel: 'Latviešu', flag: '🇱🇻' },
  { code: 'et', label: 'Estonian', nativeLabel: 'Eesti', flag: '🇪🇪' },
  { code: 'is', label: 'Icelandic', nativeLabel: 'Íslenska', flag: '🇮🇸' },
  { code: 'ga', label: 'Irish', nativeLabel: 'Gaeilge', flag: '🇮🇪' },
  { code: 'mt', label: 'Maltese', nativeLabel: 'Malti', flag: '🇲🇹' },
  { code: 'sr', label: 'Serbian', nativeLabel: 'Srpski', flag: '🇷🇸' },
  { code: 'sq', label: 'Albanian', nativeLabel: 'Shqip', flag: '🇦🇱' },
  { code: 'bs', label: 'Bosnian', nativeLabel: 'Bosanski', flag: '🇧🇦' },
  { code: 'mk', label: 'Macedonian', nativeLabel: 'Македонски', flag: '🇲🇰' },
  { code: 'be', label: 'Belarusian', nativeLabel: 'Беларуская', flag: '🇧🇾' },
  { code: 'ca', label: 'Catalan', nativeLabel: 'Català', flag: 'CA' },
  { code: 'eu', label: 'Basque', nativeLabel: 'Euskara', flag: 'EU' },
  { code: 'cy', label: 'Welsh', nativeLabel: 'Cymraeg', flag: 'CY' },
] as const;

export type AppLocale = (typeof SUPPORTED_LOCALES)[number]['code'];

export function localeFlag(code: AppLocale): string {
  return SUPPORTED_LOCALES.find((locale) => locale.code === code)?.flag ?? '🌐';
}

export function localeLabel(code: AppLocale): string {
  return (
    SUPPORTED_LOCALES.find((locale) => locale.code === code)?.nativeLabel ?? code
  );
}

export function isAppLocale(value: string): value is AppLocale {
  return SUPPORTED_LOCALES.some((locale) => locale.code === value);
}

export function resolveAppLocale(value: string | undefined): AppLocale {
  const code = value?.slice(0, 2);
  return code && isAppLocale(code) ? code : 'en';
}
