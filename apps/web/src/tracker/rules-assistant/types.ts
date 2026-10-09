export interface IndexedRule {
  id: string;
  parentId: string | null;
  heading: string | null;
}

export interface LocalizedText {
  en: string;
  fr?: string;
}

export interface CuratedRule {
  id: string;
  title: string;
  /** Beginner-facing name in French. Search still accepts English keywords. */
  labelFr: string;
  category: string;
  officialRuleNumber: string;
  /** Extra official numbers cited by an explanation. The primary number is first. */
  citations?: readonly string[];
  keywords: readonly string[];
  explanation: LocalizedText;
  example: LocalizedText;
  related: readonly string[];
  /** When set, this entry explains exactly these mechanics together. */
  interactionOf?: readonly string[];
}

export interface RulesSearchHit {
  id: string;
  title: string;
  officialRuleNumber: string;
  citations: readonly string[];
  officialSourceUrl: string;
  category: string | null;
  explanation: string | null;
  explanationLocale: string | null;
  explanationFallback: boolean;
  example: string | null;
  exampleLocale: string | null;
  exampleFallback: boolean;
  curated: boolean;
  score: number;
}

export interface RulesSearchResult {
  status: 'match' | 'ambiguous' | 'none';
  normalizedQuery: string;
  unverifiedCombination: boolean;
  primary: RulesSearchHit | null;
  companions: RulesSearchHit[];
  related: RulesSearchHit[];
  alternatives: RulesSearchHit[];
}
