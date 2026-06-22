#!/usr/bin/env bun
import { NodeContext } from "@effect/platform-node";
import { Effect, Exit } from "effect";
import { runHyprPayCli } from "./program";

Effect.runPromiseExit(runHyprPayCli(process.argv).pipe(Effect.provide(NodeContext.layer))).then(exit => {
  if (Exit.isFailure(exit)) {
    process.exitCode = 1;
  }
});
