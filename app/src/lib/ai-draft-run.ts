import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import { jsonSchemaOutputFormat } from "@anthropic-ai/sdk/helpers/json-schema";
import type { Currency } from "./money";
import {
  DRAFT_MODEL,
  DRAFT_SCHEMA,
  DRAFT_SYSTEM,
  draftUserText,
  type DraftResult,
} from "./ai-draft";

let client: Anthropic | null = null;

/** Ask Claude for a draft from the item's photos and the seller's note.
 *  Throws on a missing key, an API error, a refusal or unparseable output. */
export async function runDraft(
  photoUrls: string[],
  note: string,
  currency: Currency,
): Promise<DraftResult> {
  if (!process.env.ANTHROPIC_API_KEY) throw new Error("ANTHROPIC_API_KEY is not set");
  client ??= new Anthropic();

  const response = await client.messages.parse({
    model: DRAFT_MODEL,
    max_tokens: 4000,
    system: DRAFT_SYSTEM,
    output_config: { effort: "medium", format: jsonSchemaOutputFormat(DRAFT_SCHEMA) },
    messages: [
      {
        role: "user",
        content: [
          ...photoUrls.map((url) => ({ type: "image" as const, source: { type: "url" as const, url } })),
          { type: "text", text: draftUserText(note, currency) },
        ],
      },
    ],
  });

  if (response.stop_reason === "refusal") throw new Error("Model declined to draft");
  if (!response.parsed_output) throw new Error(`No draft in response (${response.stop_reason})`);
  return response.parsed_output as DraftResult;
}
