/**
 * Filter chip → X search query translation.
 * Maps frontend filter names to X API search operators.
 */

export type FilterName = "mentions" | "competitors" | "tax_news" | "influencers" | "sentiment" | "opportunities";

const FILTER_QUERIES: Record<FilterName, string> = {
  mentions: '("netrunner" OR "@NetrunnerTax" OR "netrunner tax")',
  competitors: "(koinly OR cointracker OR tokentax OR coinledger OR zenledger)",
  tax_news: '("crypto tax" (regulation OR IRS OR reporting OR compliance))',
  influencers: '"crypto tax" -is:retweet',
  sentiment: '("netrunner" OR "@NetrunnerTax")',
  opportunities: '("looking for crypto tax" OR "need help crypto taxes" OR "crypto tax software" OR "best crypto tax")',
};

const VALID_FILTERS = new Set<string>(Object.keys(FILTER_QUERIES));
const VALID_TIME_RANGES = new Set(["1h", "6h", "24h", "3d", "7d"]);

export function isValidFilter(f: string): f is FilterName {
  return VALID_FILTERS.has(f);
}

export function isValidTimeRange(t: string): boolean {
  return VALID_TIME_RANGES.has(t);
}

/**
 * Build a search context string from active filters.
 * Injected into the system prompt so Claude uses them in tool calls.
 */
export function buildFilterContext(filters: FilterName[], timeRange?: string): string {
  if (filters.length === 0 && !timeRange) return "";

  let context = "\n\nActive search context from user's selected filters:";

  if (filters.length > 0) {
    const queries = filters.map((f) => `- ${f}: ${FILTER_QUERIES[f]}`);
    context += "\nInclude these search operators in your tool calls:\n" + queries.join("\n");
  }

  if (timeRange) {
    context += `\nTime range: Restrict searches to the last ${timeRange}. Pass since: "${timeRange}" to all search tool calls.`;
  }

  context += "\nCombine these filters with the user's query. If the user's message is vague, use the filters as the primary search terms.";

  return context;
}

/**
 * Preset queries for digest/morning brief mode.
 */
export const DIGEST_QUERIES = [
  { label: "Brand Mentions", query: '"netrunner" OR "@NetrunnerTax" OR "netrunner tax" -is:retweet' },
  { label: "Competitor Activity", query: "(koinly OR cointracker OR tokentax OR coinledger OR zenledger) -is:retweet" },
  { label: "Crypto Tax News", query: '"crypto tax" (regulation OR IRS OR reporting OR news) -is:retweet lang:en' },
  { label: "Opportunities", query: '("looking for crypto tax" OR "need crypto tax" OR "best crypto tax tool") -is:retweet' },
];
