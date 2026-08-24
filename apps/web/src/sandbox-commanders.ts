import type { CommanderSelection } from './scryfall';

/**
 * Real Scryfall payloads so the dev-only match routes show live art without a
 * network round trip. Card and oracle IDs are the ones the picker would store,
 * which keeps the sandbox interchangeable with a genuine registration.
 */
const PAIRS: CommanderSelection[][] = [
  [
    {
      oracleId: 'd15642e4-e61c-4d29-af48-de837991245e',
      cardId: 'bc7cbe9b-324e-42b8-94e2-36e91cb32163',
      name: 'Tymna the Weaver',
      artCropUri:
        'https://cards.scryfall.io/art_crop/front/b/c/bc7cbe9b-324e-42b8-94e2-36e91cb32163.jpg?1783937081',
      typeLine: 'Legendary Creature — Human Cleric',
      oracleText:
        'Lifelink\nAt the beginning of each of your postcombat main phases, you may pay X life, where X is the number of opponents that were dealt combat damage this turn. If you do, draw X cards.\nPartner (You can have two commanders if both have partner.)',
      keywords: ['Lifelink', 'Partner'],
    },
    {
      oracleId: '3d867016-2601-4a37-a73d-308898d3bd37',
      cardId: '21e27b91-c7f1-4709-aa0d-8b5d81b22a0a',
      name: 'Thrasios, Triton Hero',
      artCropUri:
        'https://cards.scryfall.io/art_crop/front/2/1/21e27b91-c7f1-4709-aa0d-8b5d81b22a0a.jpg?1783937081',
      typeLine: 'Legendary Creature — Merfolk Wizard',
      oracleText:
        "{4}: Scry 1, then reveal the top card of your library. If it's a land card, put it onto the battlefield tapped. Otherwise, draw a card.\nPartner (You can have two commanders if both have partner.)",
      keywords: ['Partner', 'Scry'],
    },
  ],
  [
    {
      oracleId: '7683c2b2-a06f-4691-9cc5-1968dc032885',
      cardId: '5a7241f5-4d69-47fe-b037-95037008184c',
      name: 'Pir, Imaginative Rascal',
      artCropUri:
        'https://cards.scryfall.io/art_crop/front/5/a/5a7241f5-4d69-47fe-b037-95037008184c.jpg?1783934878',
      typeLine: 'Legendary Creature — Human',
      oracleText:
        'Partner with Toothy, Imaginary Friend (When this creature enters, target player may put Toothy into their hand from their library, then shuffle.)\nIf one or more counters would be put on a permanent your team controls, that many plus one of each of those kinds of counters are put on that permanent instead.',
      keywords: ['Partner with', 'Partner'],
    },
    {
      oracleId: '41d6cce0-b852-4d0e-aee2-081df13dd9b8',
      cardId: 'ebdf2f50-f69a-47c4-a75f-ff55781bb0c8',
      name: 'Toothy, Imaginary Friend',
      artCropUri:
        'https://cards.scryfall.io/art_crop/front/e/b/ebdf2f50-f69a-47c4-a75f-ff55781bb0c8.jpg?1783934877',
      typeLine: 'Legendary Creature — Illusion',
      oracleText:
        'Partner with Pir, Imaginative Rascal (When this creature enters, target player may put Pir into their hand from their library, then shuffle.)\nWhenever you draw a card, put a +1/+1 counter on Toothy.\nWhen Toothy leaves the battlefield, draw a card for each +1/+1 counter on it.',
      keywords: ['Partner with', 'Partner'],
    },
  ],
  [
    {
      oracleId: 'cca15007-2faf-4696-a4c5-2d7b6c1ec5b5',
      cardId: '67edf31f-ed67-4617-bf73-28a939a232a7',
      name: 'Gale, Waterdeep Prodigy',
      artCropUri:
        'https://cards.scryfall.io/art_crop/front/6/7/67edf31f-ed67-4617-bf73-28a939a232a7.jpg?1783922788',
      typeLine: 'Legendary Creature — Human Wizard',
      oracleText:
        'Whenever you cast an instant or sorcery spell from your hand, you may cast up to one target card of the other type from your graveyard. If a spell cast from your graveyard this way would be put into your graveyard, exile it instead.\nChoose a Background (You can have a Background as a second commander.)',
      keywords: ['Choose a background'],
    },
    {
      oracleId: '1682cf24-17a3-49ad-8b6f-9b7f13ebf53c',
      cardId: '11c93414-935e-462b-ad89-27ca21d01bf9',
      name: 'Raised by Giants',
      artCropUri:
        'https://cards.scryfall.io/art_crop/front/1/1/11c93414-935e-462b-ad89-27ca21d01bf9.jpg?1783922704',
      typeLine: 'Legendary Enchantment — Background',
      oracleText:
        'Commander creatures you own have base power and toughness 10/10 and are Giants in addition to their other types.',
      keywords: [],
    },
  ],
];

const SOLOS: CommanderSelection[] = [
  {
    oracleId: '7e6b9b59-cd68-4e3c-827b-38833c92d6eb',
    cardId: 'd0d33d52-3d28-4635-b985-51e126289259',
    name: "Atraxa, Praetors' Voice",
    artCropUri:
      'https://cards.scryfall.io/art_crop/front/d/0/d0d33d52-3d28-4635-b985-51e126289259.jpg?1783930136',
    typeLine: 'Legendary Creature — Phyrexian Angel Horror',
    oracleText:
      'Flying, vigilance, deathtouch, lifelink\nAt the beginning of your end step, proliferate. (Choose any number of permanents and/or players, then give each another counter of each kind already there.)',
    keywords: ['Deathtouch', 'Flying', 'Lifelink', 'Vigilance', 'Proliferate'],
  },
  {
    oracleId: '68418069-f615-40ef-ae0d-764192acae00',
    cardId: '824b2d73-2151-4e5e-9f05-8f63e2bdcaa9',
    name: 'Krenko, Mob Boss',
    artCropUri:
      'https://cards.scryfall.io/art_crop/front/8/2/824b2d73-2151-4e5e-9f05-8f63e2bdcaa9.jpg?1783909065',
    typeLine: 'Legendary Creature — Goblin Warrior',
    oracleText:
      '{T}: Create X 1/1 red Goblin creature tokens, where X is the number of Goblins you control.',
    keywords: [],
  },
  {
    oracleId: '0310dfdb-0498-488d-9f1a-279f8239e024',
    cardId: '508b1442-bf2c-4ad6-9bcf-bd894e081ab6',
    name: 'Meren of Clan Nel Toth',
    artCropUri:
      'https://cards.scryfall.io/art_crop/front/5/0/508b1442-bf2c-4ad6-9bcf-bd894e081ab6.jpg?1783907026',
    typeLine: 'Legendary Creature — Human Shaman',
    oracleText:
      "Whenever another creature you control dies, you get an experience counter.\nAt the beginning of your end step, choose target creature card in your graveyard. If that card's mana value is less than or equal to the number of experience counters you have, return it to the battlefield. Otherwise, put it into your hand.",
    keywords: [],
  },
  {
    oracleId: '41e2790d-49f5-4e98-b8d9-04179f47f13a',
    cardId: 'a577ba08-0aa8-45be-aa83-d5078770127c',
    name: 'Edgar Markov',
    artCropUri:
      'https://cards.scryfall.io/art_crop/front/a/5/a577ba08-0aa8-45be-aa83-d5078770127c.jpg?1783908078',
    typeLine: 'Legendary Creature — Vampire Knight',
    oracleText:
      'Eminence — Whenever you cast another Vampire spell, if Edgar is in the command zone or on the battlefield, create a 1/1 black Vampire creature token.\nFirst strike, haste\nWhenever Edgar attacks, put a +1/+1 counter on each Vampire you control.',
    keywords: ['First strike', 'Haste', 'Eminence'],
  },
];

/**
 * Seats are filled for the largest supported pod so changing the seat count
 * never blanks a card. The two paired seats come first because a lower seat
 * count would otherwise hide the commander damage cases worth checking.
 */
export function randomSandboxCommanders(seatCount: number): CommanderSelection[][] {
  const pairs = shuffle(PAIRS).slice(0, 2);
  const solos = shuffle(SOLOS).map((commander) => [commander]);
  return [...pairs, ...solos].slice(0, seatCount);
}

function shuffle<T>(rows: readonly T[]): T[] {
  const copy = [...rows];
  for (let index = copy.length - 1; index > 0; index -= 1) {
    const swap = Math.floor(Math.random() * (index + 1));
    [copy[index], copy[swap]] = [copy[swap]!, copy[index]!];
  }
  return copy;
}
