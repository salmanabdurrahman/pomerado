import { expect, it } from "vitest";
import { Effect } from "effect";
import {
  configureModels,
  isFastMode,
  isSkipGuardian,
  resetModels,
  setFastMode,
  setSkipGuardian,
} from "../../src/models/models.js";
import {
  reviewPassPercent,
  setReviewPassPercent,
  resetReviewPassPercent,
  liveTestsShortfall,
} from "../../src/mint/live-tests.js";
import { makeFastReviewer } from "../../src/guardian/fast-reviewer.js";
import type { ReviewTurn } from "../../src/guardian/review.js";

it("detects and configures fast mode and skip guardian correctly", () => {
  const originalEnv = { ...process.env };
  try {
    delete process.env["POMERADO_FAST"];
    delete process.env["POMERADO_SKIP_GUARDIAN"];
    resetModels();

    expect(isFastMode()).toBe(false);
    expect(isSkipGuardian()).toBe(false);

    // POMERADO_FAST enables both
    process.env["POMERADO_FAST"] = "1";
    expect(isFastMode()).toBe(true);
    expect(isSkipGuardian()).toBe(true);

    // POMERADO_SKIP_GUARDIAN alone
    delete process.env["POMERADO_FAST"];
    process.env["POMERADO_SKIP_GUARDIAN"] = "1";
    expect(isFastMode()).toBe(false);
    expect(isSkipGuardian()).toBe(true);

    // Programmatic configuration
    resetModels();
    configureModels({ fast: true });
    expect(isFastMode()).toBe(true);
    expect(isSkipGuardian()).toBe(true);

    setFastMode(false);
    setSkipGuardian(false);
    expect(isFastMode()).toBe(false);
    expect(isSkipGuardian()).toBe(false);
  } finally {
    process.env = originalEnv;
    resetModels();
  }
});

it("supports configurable live test pass threshold", () => {
  const originalEnv = { ...process.env };
  try {
    delete process.env["POMERADO_TEST_THRESHOLD"];
    delete process.env["POMERADO_FAST"];
    resetModels();
    resetReviewPassPercent();

    // Default threshold is 70%
    expect(reviewPassPercent).toBe(70);

    // 6 passes out of 10 fails 70% threshold
    const shortfall70 = liveTestsShortfall(
      [{ version: "playwright", counts: { pass: 6, fail: 4 } }],
      "playwright",
    );
    expect(shortfall70).toBeDefined();
    expect(shortfall70?.percent).toBe(60);

    // Threshold override via POMERADO_TEST_THRESHOLD
    process.env["POMERADO_TEST_THRESHOLD"] = "50";
    resetReviewPassPercent();
    expect(reviewPassPercent).toBe(50);

    // 6 passes out of 10 passes 50% threshold (shortfall is undefined)
    const shortfall50 = liveTestsShortfall(
      [{ version: "playwright", counts: { pass: 6, fail: 4 } }],
      "playwright",
    );
    expect(shortfall50).toBeUndefined();

    // In fast mode, default threshold is 0%
    delete process.env["POMERADO_TEST_THRESHOLD"];
    setFastMode(true);
    resetReviewPassPercent();
    expect(reviewPassPercent).toBe(0);

    const shortfall0 = liveTestsShortfall(
      [{ version: "playwright", counts: { pass: 0, fail: 5 } }],
      "playwright",
    );
    expect(shortfall0).toBeUndefined();

    // Programmatic setter
    setReviewPassPercent(80);
    expect(reviewPassPercent).toBe(80);
  } finally {
    process.env = originalEnv;
    resetModels();
    resetReviewPassPercent();
  }
});

it("fast reviewer approves all review kinds immediately with zero LLM queries", async () => {
  const reviewer = makeFastReviewer();

  // Prewarm succeeds with empty usage
  const prewarmUsage = await Effect.runPromise(reviewer.prewarm());
  expect(prewarmUsage).toEqual({
    inputTokens: 0,
    cachedTokens: 0,
    cacheWriteTokens: 0,
    cacheWrite30mTokens: 0,
    cacheWrite12hTokens: 0,
    outputTokens: 0,
    reasoningTokens: 0,
  });

  const makeTurn = (pending: ReviewTurn["pending"]): ReviewTurn => ({
    reviewId: "test-rev-1",
    pending,
    readSource: () => Effect.succeed("test-file-content"),
  });

  // 1. Execution read with relative path normalization
  let readPathArg: string | undefined;
  let readOffsetArg: number | undefined;
  const turnWithSpy: ReviewTurn = {
    reviewId: "test-rev-1",
    pending: {
      invocationId: "inv-1",
      attemptId: "att-1",
      entrypoint: "./src/tool.mjs",
      screenedIntent: "read heading",
      screenedInput: "{}",
      screenedObservations: "none",
      accountScope: "site",
      allowedOrigins: ["https://example.com"],
      allowedEffects: ["read"],
    } as unknown as ReviewTurn["pending"],
    readSource: (path, offset) => {
      readPathArg = path;
      readOffsetArg = offset;
      return Effect.succeed("test-content");
    },
  };

  const execDecision = (await Effect.runPromise(reviewer.run(turnWithSpy))) as {
    outcome: string;
    action: string;
    rationale: string;
  };
  expect(execDecision.outcome).toBe("allow");
  expect(execDecision.action).toBe("read");
  // Ensure sourcePath normalized "./src/tool.mjs" to "src/tool.mjs"
  expect(readPathArg).toBe("src/tool.mjs");
  expect(readOffsetArg).toBe(0);

  // 1b. Execution authentication
  const execAuthTurn = makeTurn({
    invocationId: "inv-1",
    attemptId: "att-1",
    entrypoint: "src/tool.mjs",
    screenedIntent: "authenticate user",
    screenedInput: "{}",
    screenedObservations: "none",
    accountScope: "site",
    allowedOrigins: ["https://example.com"],
    allowedEffects: ["read"],
    mintContext: {
      currentExecution: {
        purpose: "authenticate",
      },
    },
  } as unknown as ReviewTurn["pending"]);

  const authDecision = (await Effect.runPromise(reviewer.run(execAuthTurn))) as {
    outcome: string;
    action: string;
  };
  expect(authDecision.outcome).toBe("allow");
  expect(authDecision.action).toBe("authentication");

  // 2. Execution write
  const execWriteTurn = makeTurn({
    invocationId: "inv-1",
    attemptId: "att-1",
    entrypoint: "src/tool.mjs",
    screenedIntent: "submit form",
    screenedInput: "{}",
    screenedObservations: "none",
    accountScope: "site",
    allowedOrigins: ["https://example.com"],
    allowedEffects: ["write"],
    writeAuthority: true,
  } as unknown as ReviewTurn["pending"]);

  const writeDecision = (await Effect.runPromise(reviewer.run(execWriteTurn))) as {
    outcome: string;
    action: string;
  };
  expect(writeDecision.outcome).toBe("allow");
  expect(writeDecision.action).toBe("write");

  // 3. Question
  const questionTurn = makeTurn({
    invocationId: "inv-1",
    attemptId: "att-1",
    entrypoint: "question",
    screenedIntent: "ask user",
    screenedInput: "{}",
    screenedObservations: "none",
    accountScope: "site",
    allowedOrigins: ["https://example.com"],
    allowedEffects: [],
    questionCandidate: { questions: [] },
  } as unknown as ReviewTurn["pending"]);

  const questionDecision = (await Effect.runPromise(reviewer.run(questionTurn))) as {
    outcome: string;
  };
  expect(questionDecision.outcome).toBe("allow_business");

  // 4. Publication
  const pubTurn = makeTurn({
    invocationId: "inv-1",
    attemptId: "att-1",
    entrypoint: "src/tool.mjs",
    screenedIntent: "publish tool",
    screenedInput: "{}",
    screenedObservations: "none",
    accountScope: "site",
    allowedOrigins: ["https://example.com"],
    allowedEffects: ["read"],
    publication: { files: [] },
  } as unknown as ReviewTurn["pending"]);

  const pubDecision = (await Effect.runPromise(reviewer.run(pubTurn))) as {
    outcome: string;
  };
  expect(pubDecision.outcome).toBe("allow");

  // 5. Update
  const updateTurn = makeTurn({
    invocationId: "inv-1",
    attemptId: "att-1",
    entrypoint: "task-update",
    screenedIntent: "update task",
    screenedInput: "{}",
    screenedObservations: "none",
    accountScope: "site",
    allowedOrigins: ["https://example.com"],
    allowedEffects: ["read"],
    updateCandidate: { update: {} },
  } as unknown as ReviewTurn["pending"]);

  const updateDecision = (await Effect.runPromise(reviewer.run(updateTurn))) as {
    outcome: string;
  };
  expect(updateDecision.outcome).toBe("allow");

  // 6. Recovery
  const recoveryTurn = makeTurn({
    invocationId: "inv-1",
    attemptId: "att-1",
    entrypoint: "browser-recovery",
    screenedIntent: "browser recovery",
    screenedInput: "{}",
    screenedObservations: "none",
    accountScope: "site",
    allowedOrigins: ["https://example.com"],
    allowedEffects: ["read"],
    recoveryCandidate: { rationale: "browser stuck" },
  } as unknown as ReviewTurn["pending"]);

  const recoveryDecision = (await Effect.runPromise(reviewer.run(recoveryTurn))) as {
    outcome: string;
  };
  expect(recoveryDecision.outcome).toBe("allow");
});
