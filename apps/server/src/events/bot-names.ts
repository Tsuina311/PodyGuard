const FIRST_NAMES = [
  'Ava',
  'Noah',
  'Mia',
  'Leo',
  'Ivy',
  'Kai',
  'Nina',
  'Omar',
  'Pia',
  'Quinn',
  'Remy',
  'Suki',
  'Theo',
  'Uma',
  'Vik',
  'Wren',
  'Yara',
  'Zed',
  'Bea',
  'Cory',
  'Dax',
  'Elsa',
  'Finn',
  'Gia',
  'Hugo',
  'Iris',
  'Jade',
  'Kian',
  'Lila',
  'Moss',
];

export function nextBotName(taken: Set<string>): string {
  for (const name of shuffled(FIRST_NAMES)) {
    if (!taken.has(name.toLowerCase())) {
      taken.add(name.toLowerCase());
      return name;
    }
  }

  let suffix = 2;
  while (taken.has(`bot ${String(suffix)}`)) {
    suffix += 1;
  }
  const fallback = `Bot ${String(suffix)}`;
  taken.add(fallback.toLowerCase());
  return fallback;
}

function shuffled<T>(items: T[]): T[] {
  const copy = [...items];
  for (let index = copy.length - 1; index > 0; index -= 1) {
    const swap = Math.floor(Math.random() * (index + 1));
    const current = copy[index];
    const other = copy[swap];
    if (current === undefined || other === undefined) {
      continue;
    }
    copy[index] = other;
    copy[swap] = current;
  }
  return copy;
}
