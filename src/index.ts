import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { CallToolRequestSchema, ListToolsRequestSchema } from "@modelcontextprotocol/sdk/types.js";
import { lintLevelBalance } from "./tools/balanceLinter.js";
import { auditLocalization } from "./tools/locAuditor.js";
import { runAgentEvals } from "./tools/evalRunner.js";

const server = new Server(
  { name: "game-ops-mcp", version: "0.1.0" },
  { capabilities: { tools: {} } },
);

server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: [
    {
      name: "lint_level_balance",
      description:
        "Validates a level-balance JSON file and reports schema errors, zero rewards, impossible move limits, and unusual adjacent move-count spikes.",
      inputSchema: {
        type: "object",
        properties: {
          filePath: {
            type: "string",
            description: "Path to a JSON array of levels, or an object containing a levels array.",
          },
        },
        required: ["filePath"],
        additionalProperties: false,
      },
    },
    {
      name: "audit_localization",
      description:
        "Compares every target JSON locale with a base locale, reporting missing keys and incompatible {param} placeholders.",
      inputSchema: {
        type: "object",
        properties: {
          locDirPath: {
            type: "string",
            description: "Directory containing the base and target JSON localization files.",
          },
          baseLang: {
            type: "string",
            description: "Reference locale filename within locDirPath.",
            default: "en.json",
          },
        },
        required: ["locDirPath"],
        additionalProperties: false,
      },
    },
    {
      name: "run_agent_evals",
      description:
        "Runs deterministic assertion-based checks over generated word-puzzle or push-notification content.",
      inputSchema: {
        type: "object",
        properties: {
          taskType: {
            type: "string",
            enum: ["word_puzzle", "push_notification"],
            description: "The deterministic evaluation rule set to run.",
          },
          generatedOutput: {
            type: "object",
            description:
              "Generated content. Word puzzles use grid and words; notifications use title, body, and optional cta.",
            additionalProperties: true,
          },
        },
        required: ["taskType", "generatedOutput"],
        additionalProperties: false,
      },
    },
  ],
}));

function textResult(value: unknown, isError = false) {
  return {
    content: [{ type: "text" as const, text: JSON.stringify(value, null, 2) }],
    isError,
  };
}

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const args = request.params.arguments ?? {};

  try {
    switch (request.params.name) {
      case "lint_level_balance": {
        const result = await lintLevelBalance(args);
        return textResult(result, !result.ok);
      }
      case "audit_localization": {
        const result = await auditLocalization(args);
        return textResult(result, !result.ok);
      }
      case "run_agent_evals": {
        const result = runAgentEvals(args);
        return textResult(result, !result.ok);
      }
      default:
        return textResult(
          {
            ok: false,
            error: `Unknown tool: ${request.params.name}`,
          },
          true,
        );
    }
  } catch (error: unknown) {
    // The individual tools return expected validation and I/O failures themselves.
    // This protects the MCP connection from unexpected programming or system errors.
    return textResult(
      {
        ok: false,
        error: "Tool execution failed unexpectedly.",
        details: error instanceof Error ? error.message : String(error),
      },
      true,
    );
  }
});

async function main(): Promise<void> {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  // Do not write to stdout: it carries newline-delimited MCP JSON-RPC messages.
  console.error("game-ops-mcp is running on stdio");
}

main().catch((error: unknown) => {
  console.error("Failed to start game-ops-mcp:", error);
  process.exitCode = 1;
});
