/**
 * Claude tool-use agent loop.
 * Takes a user message, runs up to MAX_ITERATIONS of tool calls,
 * and returns the final text response.
 */

import Anthropic from "@anthropic-ai/sdk";
import { toolDefinitions, executeTool } from "./tools";

const MAX_ITERATIONS = 5;
const MODEL = "claude-sonnet-4-6";

let client: Anthropic | null = null;

function getClient(): Anthropic {
  if (!client) {
    client = new Anthropic();
  }
  return client;
}

const SYSTEM_PROMPT = `You are an X/Twitter research assistant for a crypto marketing team. You help find and analyze tweets, profiles, and engagement data.

When the user asks about what people are saying, search for relevant tweets. When they ask about a user, look up their profile. When they want engagement data, use the engagement analysis tool.

Guidelines:
- Always use the tools to fetch real data — never make up tweet content or metrics
- Provide concise analysis after fetching data: summarize themes, highlight top tweets, note engagement patterns
- When searching, use effective X search operators: exclude retweets with -is:retweet, filter by language with lang:en, etc.
- For engagement analysis, sort by the most relevant metric for the question
- If a query is ambiguous, search broadly first, then you can narrow down
- Format your analysis with clear sections and bullet points
- Include specific tweet URLs when referencing notable tweets
- When discussing metrics, put numbers in context (e.g., "high engagement for this niche")`;

export interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

export async function chat(
  messages: ChatMessage[]
): Promise<string> {
  const anthropic = getClient();

  // Convert to Anthropic message format
  const apiMessages: Anthropic.MessageParam[] = messages.map((m) => ({
    role: m.role,
    content: m.content,
  }));

  let iterations = 0;

  while (iterations < MAX_ITERATIONS) {
    iterations++;

    const response = await anthropic.messages.create({
      model: MODEL,
      max_tokens: 4096,
      system: SYSTEM_PROMPT,
      tools: toolDefinitions,
      messages: apiMessages,
    });

    // Check if we should stop — end_turn means Claude is done, even if tool_use blocks exist
    const toolUseBlocks = response.content.filter(
      (block): block is Anthropic.ContentBlock & { type: "tool_use" } =>
        block.type === "tool_use"
    );

    if (response.stop_reason === "end_turn" || toolUseBlocks.length === 0) {
      // Claude is done or no tool calls — extract text response
      const textBlocks = response.content.filter(
        (block): block is Anthropic.TextBlock => block.type === "text"
      );
      return textBlocks.map((b) => b.text).join("\n") || "(No response)";
    }

    // Add the assistant's response (with tool_use blocks) to messages
    apiMessages.push({ role: "assistant", content: response.content });

    // Execute all tool calls and collect results
    const toolResults: Anthropic.ToolResultBlockParam[] = [];
    for (const toolUse of toolUseBlocks) {
      const result = await executeTool(
        toolUse.name,
        toolUse.input as Record<string, any>
      );
      toolResults.push({
        type: "tool_result",
        tool_use_id: toolUse.id,
        content: result,
      });
    }

    // Add tool results as user message
    apiMessages.push({ role: "user", content: toolResults });
  }

  return "Reached maximum tool iterations. Please try a more specific query.";
}
