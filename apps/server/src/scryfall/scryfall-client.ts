import type { CommanderSelection } from '@podyguard/shared';

const DEFAULT_BASE_URL = 'https://api.scryfall.com';
const CACHE_TTL_MS = 24 * 60 * 60 * 1_000;
const MIN_REQUEST_SPACING_MS = 500;

export type { CommanderSelection } from '@podyguard/shared';

export type ArtworkVariant = {
  cardId: string;
  artCropUri: string;
};

type ScryfallImageUris = {
  normal?: string;
  art_crop?: string;
};

type ScryfallCardFace = {
  name?: string;
  oracle_id?: string;
  oracle_text?: string;
  type_line?: string;
  image_uris?: ScryfallImageUris;
};

type ScryfallCard = {
  id: string;
  oracle_id?: string;
  name: string;
  color_identity?: string[];
  keywords?: string[];
  type_line?: string;
  oracle_text?: string;
  image_uris?: ScryfallImageUris;
  card_faces?: ScryfallCardFace[];
};

type ScryfallList = {
  data: ScryfallCard[];
  has_more?: boolean;
  next_page?: string;
};

type CacheEntry<T> = {
  expiresAt: number;
  value: T;
};

export class ScryfallRateLimitError extends Error {
  constructor(public readonly retryAfter: string | null) {
    super('Scryfall is temporarily rate limiting requests.');
    this.name = 'ScryfallRateLimitError';
  }
}

export class ScryfallNetworkError extends Error {
  constructor(message = 'Could not connect to Scryfall.', options?: ErrorOptions) {
    super(message, options);
    this.name = 'ScryfallNetworkError';
  }
}

export class ScryfallNotFoundError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ScryfallNotFoundError';
  }
}

type ScryfallClientOptions = {
  fetch?: typeof fetch;
  baseUrl?: string;
  now?: () => number;
  sleep?: (milliseconds: number) => Promise<void>;
};

export class ScryfallClient {
  private readonly fetchImpl: typeof fetch;
  private readonly baseUrl: string;
  private readonly now: () => number;
  private readonly sleep: (milliseconds: number) => Promise<void>;
  private readonly cache = new Map<string, CacheEntry<unknown>>();
  private requestQueue: Promise<void> = Promise.resolve();
  private nextRequestAt = 0;

  constructor(options: ScryfallClientOptions = {}) {
    this.fetchImpl = options.fetch ?? globalThis.fetch;
    this.baseUrl = options.baseUrl ?? DEFAULT_BASE_URL;
    this.now = options.now ?? Date.now;
    this.sleep =
      options.sleep ??
      ((milliseconds) =>
        new Promise((resolve) => setTimeout(resolve, milliseconds)));
  }

  async searchCommanders(
    query: string,
    pairedWithCardId?: string,
  ): Promise<CommanderSelection[]> {
    const normalizedQuery = query.trim();
    const cacheKey = `commanders:${normalizedQuery}:${pairedWithCardId ?? ''}`;
    const cached = this.getCached<CommanderSelection[]>(cacheKey);
    if (cached) {
      return cached;
    }

    const terms = [normalizedQuery, 'is:commander', 'legal:commander'].filter(
      Boolean,
    );
    if (pairedWithCardId) {
      const selected = await this.cardById(pairedWithCardId);
      terms.push(pairingConstraint(selected));
    }

    const url = new URL('/cards/search', this.baseUrl);
    url.searchParams.set('q', terms.join(' '));
    url.searchParams.set('unique', 'cards');
    url.searchParams.set('order', 'name');

    let response: ScryfallList;
    try {
      response = await this.requestJson<ScryfallList>(url.toString());
    } catch (error) {
      if (error instanceof ScryfallNotFoundError) {
        const result: CommanderSelection[] = [];
        this.setCached(cacheKey, result);
        return result;
      }
      throw error;
    }
    const result = response.data
      .map(normalizeCommander)
      .filter((card): card is CommanderSelection => card !== null);
    this.setCached(cacheKey, result);
    return result;
  }

  async artworkVariants(input: {
    oracleId?: string;
    name?: string;
    cardId?: string;
  }): Promise<ArtworkVariant[]> {
    let identityName = input.name?.trim();
    let oracleId = input.oracleId?.trim();

    if (!oracleId && input.cardId) {
      const card = await this.cardById(input.cardId);
      oracleId = requireOracleId(card);
      identityName ??= card.name;
    }
    if (!oracleId && identityName) {
      const card = await this.namedCard(identityName);
      oracleId = requireOracleId(card);
      identityName = card.name;
    }
    if (!oracleId) {
      throw new ScryfallNotFoundError(
        'An oracleId, exact card name, or cardId is required.',
      );
    }

    const cacheKey = `artwork:${oracleId}:${identityName ?? ''}`;
    const cached = this.getCached<ArtworkVariant[]>(cacheKey);
    if (cached) {
      return cached;
    }

    const cards = await this.allSearchPages(`oracleid:${oracleId}`, 'prints');
    const seen = new Set<string>();
    const result: ArtworkVariant[] = [];
    for (const card of cards) {
      const artCropUri = artworkUri(card, identityName);
      if (!artCropUri || seen.has(artCropUri)) {
        continue;
      }
      seen.add(artCropUri);
      result.push({ cardId: card.id, artCropUri });
    }

    this.setCached(cacheKey, result);
    return result;
  }

  private async cardById(cardId: string): Promise<ScryfallCard> {
    const normalizedId = cardId.trim();
    const cacheKey = `card:${normalizedId}`;
    const cached = this.getCached<ScryfallCard>(cacheKey);
    if (cached) {
      return cached;
    }
    const card = await this.requestJson<ScryfallCard>(
      new URL(`/cards/${encodeURIComponent(normalizedId)}`, this.baseUrl).toString(),
    );
    this.setCached(cacheKey, card);
    return card;
  }

  private async namedCard(name: string): Promise<ScryfallCard> {
    const cacheKey = `named:${name.toLocaleLowerCase()}`;
    const cached = this.getCached<ScryfallCard>(cacheKey);
    if (cached) {
      return cached;
    }
    const url = new URL('/cards/named', this.baseUrl);
    url.searchParams.set('exact', name);
    const card = await this.requestJson<ScryfallCard>(url.toString());
    this.setCached(cacheKey, card);
    return card;
  }

  private async allSearchPages(
    query: string,
    unique: 'cards' | 'prints',
  ): Promise<ScryfallCard[]> {
    const first = new URL('/cards/search', this.baseUrl);
    first.searchParams.set('q', query);
    first.searchParams.set('unique', unique);

    const cards: ScryfallCard[] = [];
    let nextUrl: string | undefined = first.toString();
    while (nextUrl) {
      let page: ScryfallList;
      try {
        page = await this.requestJson<ScryfallList>(nextUrl);
      } catch (error) {
        if (error instanceof ScryfallNotFoundError) {
          return cards;
        }
        throw error;
      }
      cards.push(...page.data);
      nextUrl = page.has_more ? page.next_page : undefined;
    }
    return cards;
  }

  private async requestJson<T>(url: string): Promise<T> {
    const releaseRequestSlot = await this.reserveRequestSlot();
    try {
      let response: Response;
      try {
        response = await this.fetchImpl(url, {
          headers: {
            Accept: 'application/json',
            'User-Agent': 'PodyGuard/1.0 (Scryfall card lookup)',
          },
        });
      } catch (error) {
        throw new ScryfallNetworkError(undefined, { cause: error });
      }

      if (response.status === 429) {
        throw new ScryfallRateLimitError(response.headers.get('retry-after'));
      }
      if (response.status === 404) {
        throw new ScryfallNotFoundError(
          'The requested Scryfall card was not found.',
        );
      }
      if (!response.ok) {
        throw new ScryfallNetworkError(
          `Scryfall returned an unexpected ${String(response.status)} response.`,
        );
      }

      try {
        return (await response.json()) as T;
      } catch (error) {
        throw new ScryfallNetworkError(
          'Scryfall returned an invalid response.',
          { cause: error },
        );
      }
    } finally {
      releaseRequestSlot();
    }
  }

  private async reserveRequestSlot(): Promise<() => void> {
    const previous = this.requestQueue;
    let release!: () => void;
    this.requestQueue = new Promise<void>((resolve) => {
      release = resolve;
    });

    await previous;
    const wait = Math.max(0, this.nextRequestAt - this.now());
    if (wait > 0) {
      await this.sleep(wait);
    }
    this.nextRequestAt = this.now() + MIN_REQUEST_SPACING_MS;
    return release;
  }

  private getCached<T>(key: string): T | undefined {
    const entry = this.cache.get(key);
    if (!entry) {
      return undefined;
    }
    if (entry.expiresAt <= this.now()) {
      this.cache.delete(key);
      return undefined;
    }
    return entry.value as T;
  }

  private setCached<T>(key: string, value: T): void {
    this.cache.set(key, {
      expiresAt: this.now() + CACHE_TTL_MS,
      value,
    });
  }
}

function normalizeCommander(card: ScryfallCard): CommanderSelection | null {
  const face = matchingFace(card, card.name);
  const artCropUri =
    card.image_uris?.art_crop ?? face?.image_uris?.art_crop ?? null;
  if (!artCropUri) {
    return null;
  }
  return {
    cardId: card.id,
    oracleId: requireOracleId(card, face),
    name: card.name,
    typeLine: card.type_line ?? face?.type_line ?? '',
    oracleText: card.oracle_text ?? face?.oracle_text ?? '',
    artCropUri,
    keywords: card.keywords ?? [],
  };
}

function requireOracleId(
  card: ScryfallCard,
  face?: ScryfallCardFace,
): string {
  const oracleId = card.oracle_id ?? face?.oracle_id;
  if (!oracleId) {
    throw new ScryfallNetworkError(
      `Scryfall card "${card.name}" did not include an oracle identity.`,
    );
  }
  return oracleId;
}

function matchingFace(
  card: ScryfallCard,
  identityName?: string,
): ScryfallCardFace | undefined {
  const faces = card.card_faces ?? [];
  if (identityName) {
    const exact = faces.find(
      (face) => face.name?.toLocaleLowerCase() === identityName.toLocaleLowerCase(),
    );
    if (exact) {
      return exact;
    }
  }
  return faces.find((face) => face.image_uris);
}

function artworkUri(card: ScryfallCard, identityName?: string): string | undefined {
  return (
    card.image_uris?.art_crop ??
    matchingFace(card, identityName)?.image_uris?.art_crop
  );
}

function pairingConstraint(card: ScryfallCard): string {
  const oracleText = combinedOracleText(card);
  const typeLine = [
    card.type_line,
    ...(card.card_faces ?? []).map((face) => face.type_line),
  ]
    .filter(Boolean)
    .join(' // ');

  const namedPartner = oracleText.match(
    /(?:^|\n)Partner with ([^\n(]+?)(?:\s*\([^)]*\))?(?:\n|$)/i,
  );
  if (namedPartner?.[1]) {
    return `!"${escapeSearchValue(namedPartner[1].trim())}"`;
  }
  if (/(?:^|\n)Partner(?:\s*\([^)]*\))?(?:\n|$)/i.test(oracleText)) {
    return 'keyword:partner';
  }
  if (/(?:^|\n)Friends forever(?:\s*\([^)]*\))?(?:\n|$)/i.test(oracleText)) {
    return 'o:"Friends forever"';
  }
  if (/(?:^|\n)Choose a Background(?:\s*\([^)]*\))?(?:\n|$)/i.test(oracleText)) {
    return 't:background';
  }
  if (/\bBackground\b/i.test(typeLine)) {
    return 'o:"Choose a Background"';
  }
  if (/(?:^|\n)Doctor's companion(?:\s*\([^)]*\))?(?:\n|$)/i.test(oracleText)) {
    return 't:doctor';
  }
  if (/\bDoctor\b/i.test(typeLine)) {
    return 'o:"Doctor\'s companion"';
  }
  return `o:"Partner with ${escapeSearchValue(card.name)}"`;
}

function combinedOracleText(card: ScryfallCard): string {
  return [
    card.oracle_text,
    ...(card.card_faces ?? []).map((face) => face.oracle_text),
  ]
    .filter(Boolean)
    .join('\n');
}

function escapeSearchValue(value: string): string {
  return value.replaceAll('\\', '\\\\').replaceAll('"', '\\"');
}
