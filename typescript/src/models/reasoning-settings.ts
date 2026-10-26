import type { ModelSettings } from "@openai/agents";
import { Schema } from "effect";
import { isPromptCacheDisabled, isReasoningDisabled } from "./models.js";

/** Settings that help model quality are always on for every runtime agent. With `store:false`
 * the provider keeps no conversation state, so each response must return its encrypted
 * reasoning (`reasoning.encrypted_content`) and the SDK sends those items back on the next
 * turn, carrying reasoning across turns and continuations. Readable summaries are requested
 * too. None of our agents use hosted tools that add their own `include` entries; the SDK
 * replaces its tool-derived `include` with this provider-data value.
 *
 * When reasoning is disabled (e.g. in compatibility mode for 9router or non-OpenAI models),
 * proprietary reasoning summaries and encrypted reasoning include flags are omitted so standard
 * OpenAI-compatible endpoints do not fail with 400 Bad Request. */
export const withReasoningContinuity = (settings: ModelSettings): ModelSettings => {
  let result = settings;

  if (isReasoningDisabled()) {
    const { reasoning: _unusedReasoning, ...restSettings } = result;
    const providerData = result.providerData;
    const { include: prevInclude, ...restProviderData } = providerData ?? {};
    const include = Array.isArray(prevInclude)
      ? (prevInclude as unknown[]).filter((item) => item !== "reasoning.encrypted_content")
      : undefined;
    result = {
      ...restSettings,
      store: false,
      ...(providerData === undefined
        ? {}
        : {
            providerData: {
              ...restProviderData,
              ...(include !== undefined && include.length > 0 ? { include } : {}),
            },
          }),
    };
  } else {
    result = {
      ...result,
      store: false,
      reasoning: { ...result.reasoning, summary: "auto" },
      providerData: { ...result.providerData, include: ["reasoning.encrypted_content"] },
    };
  }

  if (isPromptCacheDisabled()) {
    const { promptCacheOptions: _unusedCache, ...restSettings } = result;
    const providerData = result.providerData;
    if (providerData !== undefined && "prompt_cache_key" in providerData) {
      const { prompt_cache_key: _unusedKey, ...restProviderData } = providerData;
      result = { ...restSettings, providerData: restProviderData };
    } else {
      result = restSettings;
    }
  }

  return result;
};

/** The reasoning context the provider applied to a response, as it reports it. A model that
 * ignores `all_turns` drops earlier turns' reasoning from the render, which also rewrites the
 * cached prompt from the first such item. */
export const effectiveReasoningContext = (
  providerData: unknown,
): "all_turns" | "current_turn" | "not_reported" => {
  const metadata = Schema.decodeUnknownEither(
    Schema.Struct({
      reasoning: Schema.Struct({ context: Schema.Literal("all_turns", "current_turn") }),
    }),
  )(providerData);
  return metadata._tag === "Right" ? metadata.right.reasoning.context : "not_reported";
};
