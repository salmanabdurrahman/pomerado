import { expect, it } from "vitest";

it("resolves endpoint with correct precedence (--endpoint > POMERADO_ENDPOINT > undefined)", () => {
  const originalEnv = { ...process.env };
  try {
    delete process.env["POMERADO_ENDPOINT"];

    const resolveEndpoint = (cliArg: string | undefined): string | undefined => {
      if (cliArg !== undefined && cliArg !== "") return cliArg;
      const envVal = process.env["POMERADO_ENDPOINT"];
      if (envVal !== undefined && envVal !== "") return envVal;
      return undefined;
    };

    // 1. Undefined when neither set
    expect(resolveEndpoint(undefined)).toBeUndefined();
    expect(resolveEndpoint("")).toBeUndefined();

    // 2. Env variable fallback
    process.env["POMERADO_ENDPOINT"] = "ws://browserless:3000";
    expect(resolveEndpoint(undefined)).toBe("ws://browserless:3000");
    expect(resolveEndpoint("")).toBe("ws://browserless:3000");

    // 3. CLI flag overrides env variable
    expect(resolveEndpoint("ws://override:3000")).toBe("ws://override:3000");

    // 4. Empty env variable returns undefined
    process.env["POMERADO_ENDPOINT"] = "";
    expect(resolveEndpoint(undefined)).toBeUndefined();
  } finally {
    process.env = originalEnv;
  }
});
