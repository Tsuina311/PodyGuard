import i18n from 'i18next';
import LanguageDetector from 'i18next-browser-languagedetector';
import { initReactI18next } from 'react-i18next';

import de from './locales/de.json';
import en from './locales/en.json';
import es from './locales/es.json';
import fr from './locales/fr.json';
import it from './locales/it.json';
import nl from './locales/nl.json';
import pl from './locales/pl.json';
import pt from './locales/pt.json';

void i18n
  .use(LanguageDetector)
  .use(initReactI18next)
  .init({
    resources: {
      en: { translation: en },
      de: { translation: de },
      fr: { translation: fr },
      es: { translation: es },
      it: { translation: it },
      pt: { translation: pt },
      nl: { translation: nl },
      pl: { translation: pl },
    },
    fallbackLng: 'en',
    interpolation: {
      escapeValue: false,
    },
    detection: {
      order: ['localStorage', 'navigator'],
      lookupLocalStorage: 'podyguard-lang',
      caches: ['localStorage'],
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
