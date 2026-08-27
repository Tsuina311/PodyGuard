import i18n from 'i18next';
import LanguageDetector from 'i18next-browser-languagedetector';
import { initReactI18next } from 'react-i18next';
import { isAppLocale } from './locales';

const localeModules = import.meta.glob<Record<string, unknown>>(
  './locales/*.json',
  { eager: true },
);

const resources = Object.fromEntries(
  Object.entries(localeModules).flatMap(([path, translation]) => {
    const code = path.match(/\/([a-z]{2})\.json$/)?.[1];
    return code ? [[code, { translation }]] : [];
  }),
);

void i18n
  .use(LanguageDetector)
  .use(initReactI18next)
  .init({
    resources,
    fallbackLng: 'en',
    supportedLngs: Object.keys(resources),
    nonExplicitSupportedLngs: true,
    load: 'languageOnly',
    interpolation: {
      escapeValue: false,
    },
    detection: {
      order: ['localStorage', 'navigator'],
      lookupLocalStorage: 'podyguard-lang',
      caches: ['localStorage'],
      convertDetectedLanguage: (lng) => {
        const code = lng.slice(0, 2);
        return isAppLocale(code) ? code : 'en';
      },
    },
  })
  .then(() => {
    setDocumentLang(i18n.resolvedLanguage);
  });

i18n.on('languageChanged', (lng) => {
  setDocumentLang(lng);
});

function setDocumentLang(lng: string | undefined) {
  if (typeof document === 'undefined') {
    return;
  }
  document.documentElement.lang = lng?.slice(0, 2) ?? 'en';
}

export default i18n;
