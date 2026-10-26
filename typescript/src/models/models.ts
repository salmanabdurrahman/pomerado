/** The only place OpenAI model IDs are named in `typescript/src` and `tools`, and tests name
 * the current models only through these constants, both enforced by
 * `typescript/tests/unit/model-ids.test.ts`; changing a model is a one-line edit here. */

export const defaultSolModel = "gpt-6.1-sol";
export const defaultLunaModel = "gpt-6-luna";

const resolveSolModel = (): string => {
  const minter = process.env["POMERADO_MINTER_MODEL"];
  if (minter !== undefined && minter !== "") return minter;
  const unified = process.env["POMERADO_MODEL"];
  if (unified !== undefined && unified !== "") return unified;
  return defaultSolModel;
};

const resolveLunaModel = (): string => {
  const guardian = process.env["POMERADO_GUARDIAN_MODEL"];
  if (guardian !== undefined && guardian !== "") return guardian;
  const unified = process.env["POMERADO_MODEL"];
  if (unified !== undefined && unified !== "") return unified;
  return defaultLunaModel;
};

/** The big model: minting, maintenance, example generation and challenge solving.
 * Can be overridden via POMERADO_MINTER_MODEL or POMERADO_MODEL environment variables,
 * or programmatically via configureModels. */
export let solModel = resolveSolModel();

/** The small model: Guardian reviews and capability assessment.
 * Can be overridden via POMERADO_GUARDIAN_MODEL or POMERADO_MODEL environment variables,
 * or programmatically via configureModels. */
export let lunaModel = resolveLunaModel();

let explicitCompatMode: boolean | undefined = undefined;

/**
 * Whether router compatibility mode is active.
 * Enabled if explicitly configured, or via POMERADO_COMPAT_MODE=1, or automatically
 * when OPENAI_BASE_URL points to a non-api.openai.com endpoint (unless disabled via POMERADO_COMPAT_MODE=0).
 */
export const isCompatMode = (): boolean => {
  if (explicitCompatMode !== undefined) return explicitCompatMode;
  const envVal = process.env["POMERADO_COMPAT_MODE"];
  if (envVal === "1" || envVal === "true") return true;
  if (envVal === "0" || envVal === "false") return false;
  const baseUrl = process.env["OPENAI_BASE_URL"];
  if (baseUrl === undefined || baseUrl === "") return false;
  try {
    const host = new URL(baseUrl).hostname;
    return host !== "api.openai.com";
  } catch {
    return !baseUrl.includes("api.openai.com");
  }
};

export const setCompatMode = (enabled: boolean | undefined): void => {
  explicitCompatMode = enabled;
};

/**
 * Check if reasoning continuity / proprietary reasoning settings should be omitted.
 */
export const isReasoningDisabled = (): boolean => {
  const envVal =
    process.env["POMERADO_DISABLE_REASONING_CONTINUITY"] ?? process.env["POMERADO_DISABLE_REASONING"];
  if (envVal === "1" || envVal === "true") return true;
  if (envVal === "0" || envVal === "false") return false;
  return isCompatMode();
};

/**
 * Check if proprietary prompt cache options and explicit breakpoints should be omitted.
 */
export const isPromptCacheDisabled = (): boolean => {
  const envVal = process.env["POMERADO_DISABLE_PROMPT_CACHE"];
  if (envVal === "1" || envVal === "true") return true;
  if (envVal === "0" || envVal === "false") return false;
  return isCompatMode();
};

/**
 * Check if OpenAI Responses API tool_choice.type="allowed_tools" should be replaced
 * with standard request.tools filtering.
 */
export const isAllowedToolsDisabled = (): boolean => {
  const envVal = process.env["POMERADO_DISABLE_ALLOWED_TOOLS"];
  if (envVal === "1" || envVal === "true") return true;
  if (envVal === "0" || envVal === "false") return false;
  return isCompatMode();
};

/**
 * Check if role: "developer" should be mapped to role: "system" for standard chat completion compatibility.
 */
export const isDeveloperRoleDisabled = (): boolean => {
  const envVal = process.env["POMERADO_ROLE_SYSTEM"];
  if (envVal === "1" || envVal === "true") return true;
  if (envVal === "0" || envVal === "false") return false;
  return isCompatMode();
};

/**
 * Configure the model IDs and compatibility programmatically (e.g. from CLI options or host options).
 */
export const configureModels = (options: {
  readonly model?: string | undefined;
  readonly minterModel?: string | undefined;
  readonly guardianModel?: string | undefined;
  readonly compat?: boolean | undefined;
}): void => {
  if (options.minterModel !== undefined && options.minterModel !== "") {
    solModel = options.minterModel;
  } else if (options.model !== undefined && options.model !== "") {
    solModel = options.model;
  }
  if (options.guardianModel !== undefined && options.guardianModel !== "") {
    lunaModel = options.guardianModel;
  } else if (options.model !== undefined && options.model !== "") {
    lunaModel = options.model;
  }
  if (options.compat !== undefined) {
    setCompatMode(options.compat);
  }
};

/**
 * Reset model IDs and compatibility mode to environment variable values or default IDs.
 */
export const resetModels = (): void => {
  solModel = resolveSolModel();
  lunaModel = resolveLunaModel();
  explicitCompatMode = undefined;
};
