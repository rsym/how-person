#!/usr/bin/env node

/**
 * How Person MCP Server
 * 
 * GitHub、X（Twitter）、SpeakerDeck、ブログのURLから
 * その人の技術スタックや人となりを分析するMCPサーバー
 */

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  ErrorCode,
  McpError,
} from "@modelcontextprotocol/sdk/types.js";
import { PersonAnalyzer } from "./analyzer.js";
import { AnalysisRequest } from "./types.js";

// 環境変数からAPIトークンを取得
const GITHUB_TOKEN = process.env.GITHUB_TOKEN;
const TWITTER_TOKEN = process.env.TWITTER_TOKEN;

// PersonAnalyzerのインスタンスを作成
const analyzer = new PersonAnalyzer(GITHUB_TOKEN, TWITTER_TOKEN);

// 最近の分析結果をキャッシュ（オプション）
const analysisCache = new Map<string, any>();

/**
 * MCPサーバーの作成
 */
const server = new Server(
  {
    name: "how-person",
    version: "0.1.0",
  },
  {
    capabilities: {
      tools: {},
    },
  }
);

/**
 * 利用可能なツールの一覧を提供するハンドラー
 */
server.setRequestHandler(ListToolsRequestSchema, async () => {
  return {
    tools: [
      {
        name: "how-person",
        description: "GitHub、X（Twitter）、SpeakerDeck、ブログのURLからその人の技術スタックや人となりを分析",
        inputSchema: {
          type: "object",
          properties: {
            github: {
              type: "string",
              description: "GitHubのプロフィールURL（例: https://github.com/username）",
            },
            twitter: {
              type: "string",
              description: "X（Twitter）のプロフィールURL（例: https://twitter.com/username または https://x.com/username）",
            },
            speakerdeck: {
              type: "string",
              description: "SpeakerDeckのプロフィールURL（例: https://speakerdeck.com/username）",
            },
            blog: {
              type: "string",
              description: "ブログのURL（例: https://example.com/blog）",
            },
          },
          // 少なくとも1つのURLが必要
          anyOf: [
            { required: ["github"] },
            { required: ["twitter"] },
            { required: ["speakerdeck"] },
            { required: ["blog"] },
          ],
        },
      },
    ],
  };
});

/**
 * ツールの実行ハンドラー
 */
server.setRequestHandler(CallToolRequestSchema, async (request) => {
  switch (request.params.name) {
    case "how-person": {
      const args = request.params.arguments as AnalysisRequest;
      
      // 少なくとも1つのURLが必要
      if (!args.github && !args.twitter && !args.speakerdeck && !args.blog) {
        throw new McpError(
          ErrorCode.InvalidParams,
          "少なくとも1つのURLを指定してください（GitHub、Twitter/X、SpeakerDeck、ブログ）"
        );
      }
      
      // URLの形式を検証
      if (args.github && !args.github.match(/^https?:\/\/(www\.)?github\.com\/[^\/]+\/?$/)) {
        throw new McpError(
          ErrorCode.InvalidParams,
          "GitHubのURLが無効です。例: https://github.com/username"
        );
      }
      
      if (args.twitter && !args.twitter.match(/^https?:\/\/(www\.)?(twitter|x)\.com\/[^\/]+\/?$/)) {
        throw new McpError(
          ErrorCode.InvalidParams,
          "X（Twitter）のURLが無効です。例: https://twitter.com/username または https://x.com/username"
        );
      }
      
      if (args.speakerdeck && !args.speakerdeck.match(/^https?:\/\/(www\.)?speakerdeck\.com\/[^\/]+\/?$/)) {
        throw new McpError(
          ErrorCode.InvalidParams,
          "SpeakerDeckのURLが無効です。例: https://speakerdeck.com/username"
        );
      }
      
      // キャッシュキーの生成
      const cacheKey = JSON.stringify(args);
      
      // キャッシュにあればそれを返す
      if (analysisCache.has(cacheKey)) {
        return {
          content: [
            {
              type: "text",
              text: analysisCache.get(cacheKey),
            },
          ],
        };
      }
      
      try {
        // 分析の実行
        const result = await analyzer.analyze(args);
        
        // 結果をキャッシュに保存
        analysisCache.set(cacheKey, result.summary);
        
        // 結果を返す
        return {
          content: [
            {
              type: "text",
              text: result.summary,
            },
          ],
        };
      } catch (error) {
        console.error("分析エラー:", error);
        throw new McpError(
          ErrorCode.InternalError,
          `分析中にエラーが発生しました: ${error}`
        );
      }
    }
    
    default:
      throw new McpError(
        ErrorCode.MethodNotFound,
        `未知のツール: ${request.params.name}`
      );
  }
});

/**
 * サーバーの起動
 */
async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("How Person MCP server running on stdio");
}

main().catch((error) => {
  console.error("Server error:", error);
  process.exit(1);
});
