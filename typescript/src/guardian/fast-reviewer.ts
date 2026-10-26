import { Effect } from "effect";
import { Usage } from "@openai/agents";
import { modelUsageCounts } from "../models/model-usage.js";
import { reviewKindOf, sourcePath } from "./review-layout.js";
import type { OpenAIReviewer } from "./openai.js";

/**
 * A fast, zero-LLM pass-through reviewer for fast mode and skip-guardian mode.
 * Approves execution, question, task update, recovery, and publication checks immediately
 * without model calls or token costs.
 */
export const makeFastReviewer = (): OpenAIReviewer => ({
  prewarm: () => Effect.succeed(modelUsageCounts(new Usage())),
  run: (turn) =>
    Effect.gen(function* () {
      const pending = turn.pending;
      const kind = reviewKindOf(pending);
      if (kind === "execution") {
        if (pending.entrypoint !== undefined) {
          // Read normalized entrypoint at offset 0 so entrypointReadAt is updated in makeGuardian
          yield* Effect.catchAll(turn.readSource(sourcePath(pending.entrypoint), 0), () => Effect.void);
        }
        const action =
          pending.mintContext?.currentExecution?.purpose === "authenticate"
            ? "authentication"
            : pending.writeAuthority === true
              ? "write"
              : "read";
        return {
          outcome: "allow",
          action,
          rationale: "Allowed in fast mode.",
        };
      }
      if (kind === "question") {
        return {
          outcome: "allow_business",
          rationale: "Allowed in fast mode.",
        };
      }
      if (kind === "update" || kind === "recovery" || kind === "publication") {
        return {
          outcome: "allow",
          rationale: "Allowed in fast mode.",
        };
      }
      return {
        outcome: "allow",
        rationale: "Allowed in fast mode.",
      };
    }),
});
