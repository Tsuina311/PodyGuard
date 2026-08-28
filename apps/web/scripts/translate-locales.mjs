import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { translate } from '@vitalets/google-translate-api';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const localesDir = path.join(__dirname, '../src/i18n/locales');
const enPath = path.join(localesDir, 'en.json');

/** Locales copied from English and still needing translation. */
const TARGETS = [
  'sv',
  'da',
  'no',
  'fi',
  'cs',
  'sk',
  'hu',
  'ro',
  'el',
  'hr',
  'sl',
  'bg',
  'uk',
  'lt',
  'lv',
  'et',
  'is',
  'ga',
  'mt',
  'sr',
  'sq',
  'bs',
  'mk',
  'be',
  'ca',
  'eu',
  'cy',
];

const CHUNK_SIZE = 25;
const DELIM = '\n␞␞␞\n';
const SLEEP_MS = 1200;
const MAX_RETRIES = 6;

const GOOGLE_LOCALE = {
  no: 'no',
  ca: 'ca',
  eu: 'eu',
  cy: 'cy',
  ga: 'ga',
  mk: 'mk',
  be: 'be',
  bs: 'bs',
  sr: 'sr',
};

const LANGUAGE_NAMES = JSON.parse(fs.readFileSync(enPath, 'utf8')).language;

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function collectStrings(value, trail = [], out = []) {
  if (typeof value === 'string') {
    out.push({ trail, value });
    return out;
  }
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    for (const [key, child] of Object.entries(value)) {
      collectStrings(child, [...trail, key], out);
    }
  }
  return out;
}

function setAtTrail(root, trail, value) {
  let node = root;
  for (let index = 0; index < trail.length - 1; index += 1) {
    node = node[trail[index]];
  }
  node[trail[trail.length - 1]] = value;
}

function protectPlaceholders(text) {
  const placeholders = [];
  const protectedText = text.replace(/\{\{[^}]+\}\}/g, (match) => {
    const token = `__PH${placeholders.length}__`;
    placeholders.push(match);
    return token;
  });
  return { protectedText, placeholders };
}

function restorePlaceholders(text, placeholders) {
  return text.replace(/__PH(\d+)__/g, (_, index) => placeholders[Number(index)] ?? _);
}

async function translateBatch(strings, target) {
  if (strings.length === 0) {
    return [];
  }
  const protectedBatch = strings.map((value) => protectPlaceholders(value));
  const payload = protectedBatch.map((row) => row.protectedText).join(DELIM);
  const googleTarget = GOOGLE_LOCALE[target] ?? target;

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt += 1) {
    try {
      const result = await translate(payload, { from: 'en', to: googleTarget });
      const parts = result.text.split(DELIM);
      if (parts.length !== strings.length) {
        throw new Error(
          `Chunk size mismatch for ${target}: expected ${strings.length}, got ${parts.length}`,
        );
      }
      return parts.map((part, index) =>
        restorePlaceholders(part.trim(), protectedBatch[index].placeholders),
      );
    } catch (error) {
      const retryable =
        attempt < MAX_RETRIES &&
        (String(error).includes('Too Many Requests') ||
          String(error).includes('429') ||
          String(error).includes('503'));
      if (!retryable) {
        throw error;
      }
      const wait = SLEEP_MS * 2 ** (attempt + 1);
      process.stdout.write(`rate limited, retry in ${wait}ms…\r`);
      await sleep(wait);
    }
  }
  throw new Error(`Failed to translate chunk for ${target}`);
}

function localeLooksTranslated(target) {
  const filePath = path.join(localesDir, `${target}.json`);
  if (!fs.existsSync(filePath)) {
    return false;
  }
  const data = JSON.parse(fs.readFileSync(filePath, 'utf8'));
  // Home is often left as "Home" in other languages; Cancel is not.
  return data.common?.cancel !== 'Cancel';
}

async function translateLocale(target) {
  const en = JSON.parse(fs.readFileSync(enPath, 'utf8'));
  const out = structuredClone(en);
  const entries = collectStrings(en).filter(({ trail }) => trail[0] !== 'language');
  const totalChunks = Math.ceil(entries.length / CHUNK_SIZE);

  for (let offset = 0; offset < entries.length; offset += CHUNK_SIZE) {
    const chunk = entries.slice(offset, offset + CHUNK_SIZE);
    const chunkIndex = Math.floor(offset / CHUNK_SIZE) + 1;
    process.stdout.write(
      `  ${target} chunk ${chunkIndex}/${totalChunks}\r`,
    );
    const translated = await translateBatch(
      chunk.map((row) => row.value),
      target,
    );
    chunk.forEach((row, index) => {
      setAtTrail(out, row.trail, translated[index] ?? row.value);
    });
    await sleep(SLEEP_MS);
  }

  out.language = LANGUAGE_NAMES;
  fs.writeFileSync(
    path.join(localesDir, `${target}.json`),
    `${JSON.stringify(out, null, 2)}\n`,
  );
  console.log(`\n✓ ${target}`);
}

const requested = process.argv.slice(2);
const targets = requested.length > 0 ? requested : TARGETS;

for (const target of targets) {
  if (!TARGETS.includes(target) && requested.length === 0) {
    continue;
  }
  if (localeLooksTranslated(target)) {
    console.log(`Skipping ${target} (already translated)`);
    continue;
  }
  console.log(`Translating ${target}…`);
  try {
    await translateLocale(target);
  } catch (error) {
    console.error(`\n✗ ${target}:`, error);
    process.exitCode = 1;
    break;
  }
}
