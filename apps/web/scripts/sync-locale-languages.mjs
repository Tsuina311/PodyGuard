import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const localesDir = path.join(__dirname, '../src/i18n/locales');
const enPath = path.join(localesDir, 'en.json');
const en = JSON.parse(fs.readFileSync(enPath, 'utf8'));

/** Native labels for the language picker (shown in aria-label / title). */
const LANGUAGE_NAMES = {
  en: 'English',
  de: 'Deutsch',
  fr: 'Français',
  es: 'Español',
  it: 'Italiano',
  pt: 'Português',
  nl: 'Nederlands',
  pl: 'Polski',
  sv: 'Svenska',
  da: 'Dansk',
  no: 'Norsk',
  fi: 'Suomi',
  cs: 'Čeština',
  sk: 'Slovenčina',
  hu: 'Magyar',
  ro: 'Română',
  el: 'Ελληνικά',
  hr: 'Hrvatski',
  sl: 'Slovenščina',
  bg: 'Български',
  uk: 'Українська',
  lt: 'Lietuvių',
  lv: 'Latviešu',
  et: 'Eesti',
  is: 'Íslenska',
  ga: 'Gaeilge',
  mt: 'Malti',
  sr: 'Srpski',
  sq: 'Shqip',
  bs: 'Bosanski',
  mk: 'Македонски',
  be: 'Беларуская',
  ca: 'Català',
  eu: 'Euskara',
  cy: 'Cymraeg',
};

const NEW_LOCALES = Object.keys(LANGUAGE_NAMES).filter(
  (code) => !fs.existsSync(path.join(localesDir, `${code}.json`)),
);

for (const code of NEW_LOCALES) {
  const copy = structuredClone(en);
  copy.language = { ...LANGUAGE_NAMES };
  fs.writeFileSync(
    path.join(localesDir, `${code}.json`),
    `${JSON.stringify(copy, null, 2)}\n`,
  );
  console.log('created', code);
}

for (const file of fs.readdirSync(localesDir).filter((name) => name.endsWith('.json'))) {
  const filePath = path.join(localesDir, file);
  const data = JSON.parse(fs.readFileSync(filePath, 'utf8'));
  data.language = { ...LANGUAGE_NAMES };
  fs.writeFileSync(filePath, `${JSON.stringify(data, null, 2)}\n`);
  console.log('updated language section', file);
}
