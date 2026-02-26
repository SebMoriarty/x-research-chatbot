/**
 * Tool definitions and executors for Claude tool-use.
 * Wraps the x-research lib functions as Claude-callable tools.
 */

import Anthropic from "@anthropic-ai/sdk";
import * as api from "./lib/api";

// Tool definitions for the Anthropic API
export const toolDefinitions: Anthropic.Tool[] = [
  {
    name: "x_search",
    description:
      "Search recent tweets (last 7 days) by keyword or X search syntax. Supports operators like 'from:user', '-is:retweet', 'lang:en', '#hashtag', etc.",
    input_schema: {
      type: "object",
      properties: {
        query: {
          type: "string",
          description:
            "Search query. Can use X search operators: 'solana tax', 'from:netrunner_tax', '#crypto -is:retweet', etc.",
        },
        max_results: {
          type: "number",
          description: "Max tweets to return (10-100). Default: 50.",
        },
        sort_order: {
          type: "string",
          enum: ["relevancy", "recency"],
          description: "Sort by relevancy (default) or recency.",
        },
        since: {
          type: "string",
          description:
            "Time filter. Shorthand: '1h', '6h', '1d', '3d', '7d'. Or ISO 8601 timestamp.",
        },
      },
      required: ["query"],
    },
  },
  {
    name: "x_user_profile",
    description:
      "Look up an X/Twitter user's profile info and their recent tweets.",
    input_schema: {
      type: "object",
      properties: {
        username: {
          type: "string",
          description: "Twitter username (without @). E.g. 'netrunner_tax'.",
        },
        count: {
          type: "number",
          description: "Number of recent tweets to fetch (default: 20, max: 100).",
        },
        include_replies: {
          type: "boolean",
          description: "Include reply tweets (default: false).",
        },
      },
      required: ["username"],
    },
  },
  {
    name: "x_get_tweet",
    description: "Fetch a single tweet by its ID, including full metrics.",
    input_schema: {
      type: "object",
      properties: {
        tweet_id: {
          type: "string",
          description: "The tweet ID (numeric string).",
        },
      },
      required: ["tweet_id"],
    },
  },
  {
    name: "x_thread",
    description:
      "Fetch a full conversation thread starting from a tweet ID. Returns all replies in the thread.",
    input_schema: {
      type: "object",
      properties: {
        tweet_id: {
          type: "string",
          description: "The root tweet ID of the conversation.",
        },
      },
      required: ["tweet_id"],
    },
  },
  {
    name: "x_engagement_analysis",
    description:
      "Search tweets and analyze by engagement. Returns tweets sorted by a chosen metric, optionally filtered by minimum thresholds.",
    input_schema: {
      type: "object",
      properties: {
        query: {
          type: "string",
          description: "Search query.",
        },
        sort_by: {
          type: "string",
          enum: ["likes", "impressions", "retweets", "replies"],
          description: "Metric to sort by (default: likes).",
        },
        min_likes: {
          type: "number",
          description: "Minimum likes filter.",
        },
        min_impressions: {
          type: "number",
          description: "Minimum impressions filter.",
        },
        since: {
          type: "string",
          description: "Time filter. E.g. '1d', '3d', '7d'.",
        },
        max_results: {
          type: "number",
          description: "Max tweets to fetch before filtering (10-100).",
        },
      },
      required: ["query"],
    },
  },
];

// Format a tweet compactly for Claude's context
function formatTweet(t: api.Tweet): string {
  const m = t.metrics;
  const date = new Date(t.created_at).toISOString().replace("T", " ").slice(0, 16);
  return [
    `@${t.username} (${t.name}) — ${date}`,
    t.text,
    `Likes: ${m.likes} | RT: ${m.retweets} | Replies: ${m.replies} | Impressions: ${m.impressions} | Bookmarks: ${m.bookmarks}`,
    `URL: ${t.tweet_url}`,
  ].join("\n");
}

// Execute a tool call and return the result string
export async function executeTool(
  name: string,
  input: Record<string, any>
): Promise<string> {
  try {
    switch (name) {
      case "x_search": {
        const tweets = await api.search(input.query, {
          maxResults: input.max_results || 50,
          sortOrder: input.sort_order || "relevancy",
          since: input.since,
        });
        if (tweets.length === 0) return "No tweets found for this query.";
        return `Found ${tweets.length} tweets:\n\n${tweets.map(formatTweet).join("\n---\n")}`;
      }

      case "x_user_profile": {
        const { user, tweets } = await api.profile(input.username, {
          count: input.count || 20,
          includeReplies: input.include_replies || false,
        });
        const pm = user.public_metrics || {};
        let result = `Profile: @${user.username} — ${user.name}\n`;
        result += `Bio: ${user.description || "(none)"}\n`;
        result += `Followers: ${pm.followers_count || 0} | Following: ${pm.following_count || 0} | Tweets: ${pm.tweet_count || 0}\n`;
        result += `Joined: ${user.created_at || "unknown"}\n\n`;
        result += `Recent tweets (${tweets.length}):\n\n`;
        result += tweets.map(formatTweet).join("\n---\n");
        return result;
      }

      case "x_get_tweet": {
        const tweet = await api.getTweet(input.tweet_id);
        if (!tweet) return "Tweet not found.";
        return formatTweet(tweet);
      }

      case "x_thread": {
        const tweets = await api.thread(input.tweet_id);
        if (tweets.length === 0) return "No thread found for this tweet ID.";
        return `Thread (${tweets.length} tweets):\n\n${tweets.map(formatTweet).join("\n---\n")}`;
      }

      case "x_engagement_analysis": {
        let tweets = await api.search(input.query, {
          maxResults: input.max_results || 100,
          sortOrder: "relevancy",
          since: input.since,
        });
        tweets = api.dedupe(tweets);
        if (input.min_likes || input.min_impressions) {
          tweets = api.filterEngagement(tweets, {
            minLikes: input.min_likes,
            minImpressions: input.min_impressions,
          });
        }
        tweets = api.sortBy(tweets, input.sort_by || "likes");
        if (tweets.length === 0) return "No tweets matched the engagement criteria.";
        return `Engagement analysis — ${tweets.length} tweets sorted by ${input.sort_by || "likes"}:\n\n${tweets.map(formatTweet).join("\n---\n")}`;
      }

      default:
        return `Unknown tool: ${name}`;
    }
  } catch (err: any) {
    // Sanitize error — never leak tokens, paths, or internal details
    const msg = (err.message || "Unknown error")
      .replace(/Bearer\s+[A-Za-z0-9\-._~+/]+=*/g, "Bearer [REDACTED]")
      .replace(/curl.*$/s, "[request failed]");
    return `Error: ${msg}`;
  }
}
