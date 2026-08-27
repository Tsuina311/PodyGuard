import { useTranslation } from 'react-i18next';
import { Languages } from 'lucide-react';
import i18n from '../i18n';
import { SUPPORTED_LOCALES, type AppLocale } from '../i18n/locales';

function currentLocale(): AppLocale {
  const code = i18n.language?.slice(0, 2);
  return SUPPORTED_LOCALES.some((locale) => locale.code === code)
    ? (code as AppLocale)
    : 'en';
}

export function LanguageSwitcherCorner() {
  return (
    <div className="fixed top-4 left-4 z-50">
      <LanguageSwitcher />
    </div>
  );
}

export function LanguageSwitcher() {
  const { t, i18n: i18nInstance } = useTranslation();
  const locale = currentLocale();

  return (
    <div className="language-switcher">
      <Languages size={14} aria-hidden className="language-switcher__icon" />
      <label className="sr-only" htmlFor="language-switcher">
        {t('common.language')}
      </label>
      <select
        id="language-switcher"
        className="language-switcher__select"
        value={locale}
        aria-label={t('common.language')}
        onChange={(event) => {
          void i18nInstance.changeLanguage(event.target.value);
        }}
      >
        {SUPPORTED_LOCALES.map(({ code }) => (
          <option key={code} value={code}>
            {t(`language.${code}`)}
          </option>
        ))}
      </select>
    </div>
  );
}
