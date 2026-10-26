import { expect, it } from "vitest";
import {
  configureModels,
  isCompatMode,
  isReasoningDisabled,
  isPromptCacheDisabled,
  isAllowedToolsDisabled,
  isDeveloperRoleDisabled,
  resetModels,
  setCompatMode,
} from "../../src/models/models.js";
import { withReasoningContinuity } from "../../src/models/reasoning-settings.js";
import {
  cachedDeveloperItem,
  withAllowedTools,
  withCacheComparison,
  withPromptCache,
} from "../../src/models/prompt-cache.js";
import {
  developerMessage,
  withCacheComparison as withInstructionsCacheComparison,
} from "../../src/models/cached-instructions.js";
import type { ModelRequest, ModelSettings } from "@openai/agents";

it("detects and sets compatibility mode correctly", () => {
  const originalEnv = { ...process.env };
  try {
    delete process.env["POMERADO_COMPAT_MODE"];
    delete process.env["OPENAI_BASE_URL"];
    resetModels();
    expect(isCompatMode()).toBe(false);
    expect(isReasoningDisabled()).toBe(false);
    expect(isPromptCacheDisabled()).toBe(false);
    expect(isAllowedToolsDisabled()).toBe(false);
    expect(isDeveloperRoleDisabled()).toBe(false);

    // Auto-enabled when non-openai BASE_URL is set
    process.env["OPENAI_BASE_URL"] = "https://api.9router.com/v1";
    expect(isCompatMode()).toBe(true);

    // Disabled when official openai URL is set
    process.env["OPENAI_BASE_URL"] = "https://api.openai.com/v1";
    expect(isCompatMode()).toBe(false);

    // Subdomain / path proxy URL
    process.env["OPENAI_BASE_URL"] = "https://api.openai.com.myproxy.internal/v1";
    expect(isCompatMode()).toBe(true);

    // Explicit POMERADO_COMPAT_MODE takes precedence
    process.env["POMERADO_COMPAT_MODE"] = "1";
    expect(isCompatMode()).toBe(true);

    process.env["POMERADO_COMPAT_MODE"] = "0";
    expect(isCompatMode()).toBe(false);

    // Programmatic configuration
    configureModels({ compat: true });
    expect(isCompatMode()).toBe(true);

    setCompatMode(false);
    expect(isCompatMode()).toBe(false);
  } finally {
    process.env = originalEnv;
    resetModels();
  }
});

it("sanitizes reasoning settings when reasoning is disabled", () => {
  const originalEnv = { ...process.env };
  try {
    const rawSettings: ModelSettings = {
      store: false,
      reasoning: { effort: "medium" as const },
      providerData: { include: ["reasoning.encrypted_content", "other_flag"] },
    };

    // When compat mode is OFF
    setCompatMode(false);
    const standard = withReasoningContinuity(rawSettings);
    expect(standard.reasoning).toEqual({ effort: "medium", summary: "auto" });
    expect(standard.providerData?.["include"]).toContain("reasoning.encrypted_content");

    // When compat mode is ON
    setCompatMode(true);
    const sanitized = withReasoningContinuity(rawSettings);
    expect(sanitized.reasoning).toBeUndefined();
    expect(sanitized.providerData?.["include"]).toEqual(["other_flag"]);
    expect(sanitized.store).toBe(false);

    // When providerData.include only has reasoning.encrypted_content
    const singleIncludeSettings: ModelSettings = {
      store: false,
      reasoning: { effort: "low" as const },
      providerData: { include: ["reasoning.encrypted_content"] },
    };
    const sanitizedSingle = withReasoningContinuity(singleIncludeSettings);
    expect(sanitizedSingle.reasoning).toBeUndefined();
    expect(sanitizedSingle.providerData?.["include"]).toBeUndefined();

    // When settings has promptCacheOptions and prompt_cache_key (like Guardian / Outcome review)
    const guardianSettings: ModelSettings = {
      store: false,
      promptCacheOptions: { mode: "implicit" as const },
      providerData: { prompt_cache_key: "guardian-key" },
    };
    const sanitizedGuardian = withReasoningContinuity(guardianSettings);
    expect(sanitizedGuardian.promptCacheOptions).toBeUndefined();
    expect(sanitizedGuardian.providerData?.["prompt_cache_key"]).toBeUndefined();
  } finally {
    process.env = originalEnv;
    resetModels();
  }
});

it("omits prompt cache options and explicit breakpoints when prompt cache is disabled", () => {
  const originalEnv = { ...process.env };
  try {
    const rawSettings: ModelSettings = {
      store: false,
      providerData: {},
    };

    // When compat mode is OFF
    setCompatMode(false);
    const cachedSettings = withPromptCache(rawSettings, { key: "test-key", mode: "implicit" });
    expect(cachedSettings.providerData?.["prompt_cache_options"]).toBeDefined();
    expect(cachedSettings.providerData?.["prompt_cache_key"]).toBe("test-key");

    const devItem = cachedDeveloperItem(["instruction text"], "12h");
    const itemContent = devItem.providerData?.["content"] as Array<Record<string, unknown>>;
    expect(itemContent[0]?.["prompt_cache_breakpoint"]).toBeDefined();
    expect(devItem.providerData?.["role"]).toBe("developer");

    const devMsg = developerMessage({ text: "system text", breakpoint: "12h" });
    const msgContent = devMsg.providerData?.["content"] as Array<Record<string, unknown>>;
    expect(msgContent[0]?.["prompt_cache_breakpoint"]).toBeDefined();
    expect(devMsg.providerData?.["role"]).toBe("developer");

    // When compat mode is ON
    setCompatMode(true);
    const strippedSettings = withPromptCache(rawSettings, { key: "test-key", mode: "implicit" });
    expect(strippedSettings.providerData?.["prompt_cache_options"]).toBeUndefined();
    expect(strippedSettings.providerData?.["prompt_cache_key"]).toBeUndefined();

    const strippedDevItem = cachedDeveloperItem(["instruction text"], "12h");
    const strippedItemContent = strippedDevItem.providerData?.["content"] as Array<Record<string, unknown>>;
    expect(strippedItemContent[0]?.["prompt_cache_breakpoint"]).toBeUndefined();
    expect(strippedDevItem.providerData?.["role"]).toBe("system");

    const strippedDevMsg = developerMessage({ text: "system text", breakpoint: "12h" });
    const strippedMsgContent = strippedDevMsg.providerData?.["content"] as Array<Record<string, unknown>>;
    expect(strippedMsgContent[0]?.["prompt_cache_breakpoint"]).toBeUndefined();
    expect(strippedDevMsg.providerData?.["role"]).toBe("system");

    // withCacheComparison check
    const rawReq = {
      input: "test",
      tools: [],
      modelSettings: {},
    } as unknown as ModelRequest;
    setCompatMode(false);
    const cachedReq = withCacheComparison(rawReq, "resp-123");
    expect(cachedReq.modelSettings.providerData?.["prompt_cache_options"]).toBeDefined();

    setCompatMode(true);
    const strippedReq = withCacheComparison(rawReq, "resp-123");
    expect(strippedReq.modelSettings.providerData?.["prompt_cache_options"]).toBeUndefined();

    // withInstructionsCacheComparison check (cached-instructions.js)
    setCompatMode(false);
    const cachedInstReq = withInstructionsCacheComparison(rawReq, "resp-456");
    expect(cachedInstReq.modelSettings.providerData?.["prompt_cache_options"]).toBeDefined();

    setCompatMode(true);
    const strippedInstReq = withInstructionsCacheComparison(rawReq, "resp-456");
    expect(strippedInstReq.modelSettings.providerData?.["prompt_cache_options"]).toBeUndefined();
  } finally {
    process.env = originalEnv;
    resetModels();
  }
});

it("filters tools directly instead of using tool_choice.allowed_tools in compat mode", () => {
  const originalEnv = { ...process.env };
  try {
    const rawRequest = {
      input: "test",
      tools: [
        {
          type: "function",
          name: "tool_a",
          description: "a",
          parameters: { type: "object", properties: {}, required: [], additionalProperties: false },
        },
        {
          type: "function",
          name: "tool_b",
          description: "b",
          parameters: { type: "object", properties: {}, required: [], additionalProperties: false },
        },
      ],
      modelSettings: { toolChoice: "auto" },
    } as unknown as ModelRequest;

    // When compat mode is OFF
    setCompatMode(false);
    const standardRequest = withAllowedTools(rawRequest, (name) => name === "tool_a");
    expect(standardRequest.tools.length).toBe(2);
    expect(standardRequest.modelSettings.providerData?.["tool_choice"]).toEqual({
      type: "allowed_tools",
      mode: "auto",
      tools: [{ type: "function", name: "tool_a" }],
    });

    // When compat mode is ON
    setCompatMode(true);
    const compatRequest = withAllowedTools(rawRequest, (name) => name === "tool_a");
    expect(compatRequest.tools.length).toBe(1);
    expect(compatRequest.tools[0]?.name).toBe("tool_a");
    expect(compatRequest.modelSettings.providerData?.["tool_choice"]).toBeUndefined();
  } finally {
    process.env = originalEnv;
    resetModels();
  }
});
