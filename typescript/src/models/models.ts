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

/**
 * Configure the model IDs programmatically (e.g. from CLI options or host options).
 */
export const configureModels = (options: {
  readonly model?: string | undefined;
  readonly minterModel?: string | undefined;
  readonly guardianModel?: string | undefined;
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
};

/**
 * Reset model IDs to environment variable values or default IDs.
 */
export const resetModels = (): void => {
  solModel = resolveSolModel();
  lunaModel = resolveLunaModel();
};
