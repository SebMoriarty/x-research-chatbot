/**
 * Claude tool-use agent loop.
 * Takes a user message, runs up to MAX_ITERATIONS of tool calls,
 * and returns the final text response.
 */

import Anthropic from "@anthropic-ai/sdk";
import { toolDefinitions, executeTool } from "./tools";
import { trackTokens } from "./usage";
import { buildFilterContext, DIGEST_QUERIES, type FilterName } from "./filters";

const MAX_ITERATIONS = 5;
const DIGEST_MAX_ITERATIONS = 8;
const MODEL = "claude-sonnet-4-6";

let client: Anthropic | null = null;

function getClient(): Anthropic {
  if (!client) {
    client = new Anthropic();
  }
  return client;
}

const SYSTEM_PROMPT = `You are Noel, the X/Twitter research assistant for Netrunner Tax — a Solana-native crypto tax product. Your job is to help the Netrunner marketing team monitor brand mentions, track competitors, identify influencers, and spot opportunities in the crypto tax space.

Default search context: When searching without specific filters, include "netrunner" OR "netrunner tax" OR "@NetrunnerTax" in queries unless the user explicitly specifies a different scope.

Known competitors: Koinly, CoinTracker, TokenTax, CoinLedger, ZenLedger.

Guidelines:
- Always use the tools to fetch real data — never make up tweet content or metrics
- Provide concise analysis after fetching data: summarize themes, highlight top tweets, note engagement patterns
- When searching, use effective X search operators: exclude retweets with -is:retweet, filter by language with lang:en, etc.
- For engagement analysis, sort by the most relevant metric for the question
- If a query is ambiguous, search broadly first, then you can narrow down
- Format your analysis with clear sections and bullet points
- Include specific tweet URLs when referencing notable tweets
- When discussing metrics, put numbers in context (e.g., "high engagement for this niche")
- If the user has active search filters, incorporate them into every tool call
- After every response, append exactly this on its own line:
  <!--suggestions:["suggestion1","suggestion2","suggestion3"]-->
  Generate exactly 3 short (<60 chars) actionable follow-ups specific to this response.
- When presenting engagement metrics for 3+ items, include a chart on its own line:
  <!--chart:{"type":"bar","labels":["label1","label2"],"data":[100,50],"title":"Chart Title"}-->
  type: "bar", "line", or "pie". Max 10 items. One chart per response. Only when it adds value.`;

const DIGEST_SYSTEM_PROMPT = `You are Noel, running a morning brief digest for the Netrunner Tax marketing team. You will be given preset search categories. Call the x_search tool for each one, then provide a combined executive summary.

Structure your response as:
## Morning Brief — [date]

### Brand Mentions
[Summary of Netrunner mentions, notable tweets, sentiment]

### Competitor Activity
[What Koinly, CoinTracker, TokenTax, CoinLedger, ZenLedger are doing]

### Crypto Tax News
[Regulatory updates, industry news, trending tax topics]

### Opportunities
[People looking for crypto tax solutions, potential leads, partnership openings]

### Key Takeaways
[3-5 bullet points of the most actionable insights]

Be concise but thorough. Include tweet URLs for anything notable.`;

const DEEP_DIVE_ADDENDUM = `

DEEP DIVE MODE — provide comprehensive analysis with these 5 sections:
1. **Key Excerpts**: Quote the most relevant tweet text verbatim (2-4 excerpts)
2. **Engagement Delta**: Compare current engagement to the account's baseline or previous similar posts (e.g., "3x above average likes")
3. **Suggested Reply Copy**: Draft 1-2 ready-to-post reply options the Netrunner team could use
4. **Risk Flags**: Note any negative sentiment, misinformation, PR risks, or competitor attacks
5. **Opportunity Flags**: Highlight partnership openings, viral potential, unmet needs, or influencer engagement windows`;

export interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

interface ChatOptions {
  filters?: FilterName[];
  timeRange?: string;
  deepDive?: boolean;
  signal?: AbortSignal;
}

export async function chat(
  messages: ChatMessage[],
  opts: ChatOptions = {}
): Promise<string> {
  const anthropic = getClient();

  // Build system prompt with filter context and deep dive
  let systemPrompt = SYSTEM_PROMPT;
  if (opts.filters?.length || opts.timeRange) {
    systemPrompt += buildFilterContext(opts.filters || [], opts.timeRange);
  }
  if (opts.deepDive) {
    systemPrompt += DEEP_DIVE_ADDENDUM;
  }

  // Convert to Anthropic message format
  const apiMessages: Anthropic.MessageParam[] = messages.map((m) => ({
    role: m.role,
    content: m.content,
  }));

  let iterations = 0;

  while (iterations < MAX_ITERATIONS) {
    iterations++;
    opts.signal?.throwIfAborted();

    const response = await anthropic.messages.create({
      model: MODEL,
      max_tokens: opts.deepDive ? 8192 : 4096,
      system: systemPrompt,
      tools: toolDefinitions,
      messages: apiMessages,
    }, { signal: opts.signal });

    // Track token usage
    if (response.usage) {
      trackTokens(response.usage.input_tokens, response.usage.output_tokens);
    }

    // Check if we should stop — end_turn means Claude is done
    const toolUseBlocks = response.content.filter(
      (block): block is Anthropic.ContentBlock & { type: "tool_use" } =>
        block.type === "tool_use"
    );

    if (response.stop_reason === "end_turn" || toolUseBlocks.length === 0) {
      const textBlocks = response.content.filter(
        (block): block is Anthropic.TextBlock => block.type === "text"
      );
      return textBlocks.map((b) => b.text).join("\n") || "(No response)";
    }

    // Add the assistant's response (with tool_use blocks) to messages
    apiMessages.push({ role: "assistant", content: response.content });

    // Execute all tool calls in parallel and collect results
    opts.signal?.throwIfAborted();
    const toolResults: Anthropic.ToolResultBlockParam[] = await Promise.all(
      toolUseBlocks.map(async (toolUse) => {
        try {
          const content = await executeTool(toolUse.name, toolUse.input as Record<string, any>);
          return { type: "tool_result" as const, tool_use_id: toolUse.id, content };
        } catch (err: any) {
          return { type: "tool_result" as const, tool_use_id: toolUse.id, content: `Tool error: ${err.message}`, is_error: true };
        }
      })
    );

    // Add tool results as user message
    apiMessages.push({ role: "user", content: toolResults });
  }

  return "Reached maximum tool iterations. Please try a more specific query.";
}

/**
 * Digest mode — runs preset queries and returns combined analysis.
 * Single agent call with multiple tool invocations.
 */
export async function digest(timeRange: string = "24h", signal?: AbortSignal): Promise<string> {
  const anthropic = getClient();

  const querySummary = DIGEST_QUERIES.map(
    (q) => `- ${q.label}: search for ${q.query} (last ${timeRange})`
  ).join("\n");

  const userPrompt = `Run the morning brief. Search these categories and provide a combined analysis:\n\n${querySummary}\n\nTime range: ${timeRange}. Use the x_search tool for each category, then synthesize everything into a structured brief.`;

  const apiMessages: Anthropic.MessageParam[] = [
    { role: "user", content: userPrompt },
  ];

  let iterations = 0;

  while (iterations < DIGEST_MAX_ITERATIONS) {
    iterations++;
    signal?.throwIfAborted();

    const response = await anthropic.messages.create({
      model: MODEL,
      max_tokens: 8192,
      system: DIGEST_SYSTEM_PROMPT,
      tools: toolDefinitions,
      messages: apiMessages,
    }, { signal });

    // Track token usage
    if (response.usage) {
      trackTokens(response.usage.input_tokens, response.usage.output_tokens);
    }

    const toolUseBlocks = response.content.filter(
      (block): block is Anthropic.ContentBlock & { type: "tool_use" } =>
        block.type === "tool_use"
    );

    if (response.stop_reason === "end_turn" || toolUseBlocks.length === 0) {
      const textBlocks = response.content.filter(
        (block): block is Anthropic.TextBlock => block.type === "text"
      );
      return textBlocks.map((b) => b.text).join("\n") || "(No digest results)";
    }

    apiMessages.push({ role: "assistant", content: response.content });

    signal?.throwIfAborted();
    const toolResults: Anthropic.ToolResultBlockParam[] = await Promise.all(
      toolUseBlocks.map(async (toolUse) => {
        try {
          const content = await executeTool(toolUse.name, toolUse.input as Record<string, any>);
          return { type: "tool_result" as const, tool_use_id: toolUse.id, content };
        } catch (err: any) {
          return { type: "tool_result" as const, tool_use_id: toolUse.id, content: `Tool error: ${err.message}`, is_error: true };
        }
      })
    );

    apiMessages.push({ role: "user", content: toolResults });
  }

  return "Digest reached maximum iterations. Partial results may be available above.";
}
