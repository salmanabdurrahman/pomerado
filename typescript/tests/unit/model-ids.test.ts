import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { expect, it } from "vitest";
import {
  configureModels,
  defaultLunaModel,
  defaultSolModel,
  lunaModel,
  resetModels,
  solModel,
} from "../../src/models/models.js";
import { guardianModel } from "../../src/guardian/model.js";

const root = fileURLToPath(new URL("../../../", import.meta.url));
const codeFiles = (...directories: ReadonlyArray<string>) =>
  execFileSync("git", ["ls-files", ...directories], { cwd: root, encoding: "utf8" })
    .split("\n")
    .filter((path) => /\.(?:[cm]?[jt]s|json)$/.test(path))
    .map((path) => ({ path, source: readFileSync(`${root}${path}`, "utf8") }));

it("names OpenAI model IDs only in the models file", () => {
  const offenders = codeFiles("typescript/src", "tools").filter(
    ({ path, source }) => path !== "typescript/src/models/models.ts" && /\bgpt-\d/.test(source),
  );
  expect(offenders.map(({ path }) => path)).toEqual([]);
});

// Tests may still pin an older ID on purpose, such as a model the proof meter must reject.
it("refers to the current models in tests only through their constants", () => {
  const current = [defaultSolModel, defaultLunaModel].map((id) => id.replaceAll(".", "\\."));
  const literal = new RegExp(`["'\`](?:${current.join("|")})["'\`]`);
  const offenders = codeFiles("typescript/tests").filter(({ source }) => literal.test(source));
  expect(offenders.map(({ path }) => path)).toEqual([]);
});

it("supports configuring custom models dynamically", () => {
  try {
    configureModels({ model: "custom-unified-model" });
    expect(solModel).toBe("custom-unified-model");
    expect(lunaModel).toBe("custom-unified-model");
    expect(guardianModel.model).toBe("custom-unified-model");

    configureModels({ minterModel: "custom-minter", guardianModel: "custom-guardian" });
    expect(solModel).toBe("custom-minter");
    expect(lunaModel).toBe("custom-guardian");
    expect(guardianModel.model).toBe("custom-guardian");
  } finally {
    resetModels();
  }
  expect(solModel).toBe(defaultSolModel);
  expect(lunaModel).toBe(defaultLunaModel);
});

it("resolves model IDs from environment variables with correct precedence and empty string fallback", () => {
  const originalEnv = { ...process.env };
  try {
    // 1. Unified model env var
    process.env["POMERADO_MODEL"] = "unified-from-env";
    delete process.env["POMERADO_MINTER_MODEL"];
    delete process.env["POMERADO_GUARDIAN_MODEL"];
    resetModels();
    expect(solModel).toBe("unified-from-env");
    expect(lunaModel).toBe("unified-from-env");

    // 2. Specific overrides take precedence over unified
    process.env["POMERADO_MINTER_MODEL"] = "minter-from-env";
    process.env["POMERADO_GUARDIAN_MODEL"] = "guardian-from-env";
    resetModels();
    expect(solModel).toBe("minter-from-env");
    expect(lunaModel).toBe("guardian-from-env");

    // 3. Empty strings fall back to unified or default
    process.env["POMERADO_MINTER_MODEL"] = "";
    process.env["POMERADO_GUARDIAN_MODEL"] = "";
    resetModels();
    expect(solModel).toBe("unified-from-env");
    expect(lunaModel).toBe("unified-from-env");

    process.env["POMERADO_MODEL"] = "";
    resetModels();
    expect(solModel).toBe(defaultSolModel);
    expect(lunaModel).toBe(defaultLunaModel);
  } finally {
    process.env = originalEnv;
    resetModels();
  }
});
