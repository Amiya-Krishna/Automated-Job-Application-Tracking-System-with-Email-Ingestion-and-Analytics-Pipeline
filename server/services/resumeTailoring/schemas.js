// Structured-output contracts. The LLM is never allowed to return free-form
// prose: its answer must parse against this schema or it is discarded.
const { z } = require("zod");

const RewriteSchema = z.object({
  unitId: z.string().min(1).max(40),
  proposed: z.string().min(1).max(700),
  // Accepted for structure only. Evidence and reasons shown to the user are
  // derived server-side; model-written justifications are never trusted.
  evidence: z.array(z.string().max(60)).max(10).optional(),
  reason: z.string().max(400).optional(),
});

const TailoringResponseSchema = z.object({
  rewrites: z.array(RewriteSchema).max(40),
});

// JSON-Schema form for Anthropic tool input_schema / OpenAI prompts.
const TAILORING_JSON_SCHEMA = {
  type: "object",
  properties: {
    rewrites: {
      type: "array",
      items: {
        type: "object",
        properties: {
          unitId: { type: "string" },
          proposed: { type: "string" },
          evidence: { type: "array", items: { type: "string" } },
          reason: { type: "string" },
        },
        required: ["unitId", "proposed"],
      },
    },
  },
  required: ["rewrites"],
};

module.exports = { TailoringResponseSchema, TAILORING_JSON_SCHEMA };
