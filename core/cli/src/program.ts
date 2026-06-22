import { existsSync } from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { Command, Options } from "@effect/cli";
import { Console, Data, Effect } from "effect";
import type { ProductDefinition } from "@hyprpay/core/catalog";
import { migrateHyprPayPostgresStore, syncHyprPayCatalog, type HyprPayPostgresDatabase } from "@hyprpay/store-postgres";
import type { HyprPayCliConfig } from "./config";
import { captureHyprPayCliTelemetry } from "./telemetry";

export class HyprPayCliError extends Data.TaggedError("HyprPayCliError")<{
  readonly message: string;
}> {}

const defaultConfigPath = "hyprpay.config.ts";

const configOption = Options.text("config").pipe(
  Options.withDescription("Caminho do arquivo de configuração HyprPay."),
  Options.withDefault(defaultConfigPath),
);

const yesOption = Options.boolean("yes").pipe(
  Options.withAlias("y"),
  Options.withDescription("Confirma a operação sem prompt."),
);

const throwOption = Options.boolean("throw").pipe(
  Options.withDescription("Falha com exit code não-zero quando o status estiver inválido."),
);

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === "object" && value !== null;

const isPostgresDatabase = (value: unknown): value is HyprPayPostgresDatabase =>
  isRecord(value) && typeof Reflect.get(value, "execute") === "function";

const cliErrorMessage = (error: unknown): string => {
  const message = isRecord(error) ? Reflect.get(error, "message") : undefined;
  return typeof message === "string" ? message : "Falha ao executar HyprPay CLI.";
};

const isProductDefinition = (value: unknown): value is ProductDefinition => {
  if (!isRecord(value)) {
    return false;
  }

  return (
    typeof Reflect.get(value, "id") === "string" &&
    typeof Reflect.get(value, "name") === "string" &&
    Array.isArray(Reflect.get(value, "plans"))
  );
};

const isCatalog = (value: unknown): value is readonly ProductDefinition[] => Array.isArray(value) && value.every(isProductDefinition);

const readConfig = (value: unknown): Effect.Effect<HyprPayCliConfig, HyprPayCliError> => {
  if (!isRecord(value)) {
    return Effect.fail(new HyprPayCliError({ message: "Configuração HyprPay inválida." }));
  }

  const db = Reflect.get(value, "db");
  const catalog = Reflect.get(value, "catalog");

  if (!isPostgresDatabase(db)) {
    return Effect.fail(new HyprPayCliError({ message: "Configuração HyprPay precisa expor um db Postgres do Drizzle." }));
  }

  if (catalog !== undefined && !isCatalog(catalog)) {
    return Effect.fail(new HyprPayCliError({ message: "Catálogo HyprPay inválido." }));
  }

  return Effect.succeed({
    db,
    ...(catalog === undefined ? {} : { catalog }),
  });
};

export const loadHyprPayCliConfig = (configPath: string): Effect.Effect<HyprPayCliConfig, HyprPayCliError> => {
  const absolutePath = resolve(configPath);

  if (!existsSync(absolutePath)) {
    return Effect.fail(new HyprPayCliError({ message: `Arquivo de configuração não encontrado: ${configPath}` }));
  }

  return Effect.gen(function* () {
    const module = yield* Effect.tryPromise({
      // Runtime-selected user config cannot be statically imported by the CLI.
      try: async (): Promise<unknown> => import(pathToFileURL(absolutePath).href),
      catch: () => new HyprPayCliError({ message: "Falha ao carregar configuração HyprPay." }),
    });

    return yield* readConfig(isRecord(module) ? Reflect.get(module, "default") : undefined);
  });
};

const initialConfig = `import { defineHyprPayConfig } from "@hyprpay/cli/config";
import { hyprPayPostgresSchema } from "@hyprpay/store-postgres/schema";
import { drizzle } from "drizzle-orm/bun-sql";

const db = drizzle({
  connection: {
    url: process.env.DATABASE_URL ?? "postgres://postgres:postgres@localhost:5432/hyprpay",
  },
  schema: hyprPayPostgresSchema,
});

export default defineHyprPayConfig({
  db,
  catalog: [],
});
`;

const writeInitialConfig = (configPath: string, yes: boolean): Effect.Effect<void, HyprPayCliError> => {
  const absolutePath = resolve(configPath);

  if (existsSync(absolutePath) && !yes) {
    return Effect.fail(new HyprPayCliError({ message: `Arquivo já existe: ${configPath}. Use --yes para sobrescrever.` }));
  }

  return Effect.tryPromise({
    try: async () => {
      await mkdir(dirname(absolutePath), { recursive: true });
      await writeFile(absolutePath, initialConfig);
    },
    catch: () => new HyprPayCliError({ message: "Falha ao escrever configuração HyprPay." }),
  });
};

const tracked = <TValue, TError>(
  command: string,
  effect: Effect.Effect<TValue, TError>,
): Effect.Effect<TValue, TError> =>
  effect.pipe(
    Effect.tap(() => captureHyprPayCliTelemetry({ command, status: "succeeded" })),
    Effect.tapError(() => captureHyprPayCliTelemetry({ command, status: "failed" })),
  );

const initCommand = Command.make("init", { config: configOption, yes: yesOption }, ({ config, yes }) =>
  tracked(
    "init",
    writeInitialConfig(config, yes).pipe(
      Effect.andThen(Console.log(`Configuração HyprPay criada em ${config}.`)),
    ),
  ),
).pipe(Command.withDescription("Cria um arquivo hyprpay.config.ts inicial."));

const pushCommand = Command.make("push", { config: configOption, yes: yesOption }, ({ config, yes }) =>
  tracked(
    "push",
    Effect.gen(function* () {
      if (!yes) {
        return yield* Effect.fail(new HyprPayCliError({ message: "Use --yes para aplicar migrações e sincronizar catálogo." }));
      }

      const loaded = yield* loadHyprPayCliConfig(config);
      yield* migrateHyprPayPostgresStore(loaded.db);
      const result = yield* syncHyprPayCatalog(loaded.db, loaded.catalog ?? []);

      yield* Console.log(
        `HyprPay sincronizado: ${result.products} produtos, ${result.plans} planos, ${result.insertedVersions} versões novas.`,
      );
    }),
  ),
).pipe(Command.withDescription("Aplica migrações Postgres e sincroniza versões imutáveis do catálogo."));

const statusCommand = Command.make("status", { config: configOption, throwOnFailure: throwOption }, ({ config, throwOnFailure }) =>
  tracked(
    "status",
    loadHyprPayCliConfig(config).pipe(
      Effect.flatMap(loaded =>
        migrateHyprPayPostgresStore(loaded.db).pipe(
          Effect.andThen(Console.log(`HyprPay OK: ${(loaded.catalog ?? []).length} produtos configurados.`)),
        ),
      ),
      Effect.catch(error =>
        throwOnFailure
          ? Effect.fail(error)
          : Console.log(cliErrorMessage(error)),
      ),
    ),
  ),
).pipe(Command.withDescription("Valida configuração, banco Postgres e catálogo."));

const runInitCommand = Command.run(initCommand, {
  name: "hyprpay-init",
  version: "0.0.0",
});

const runPushCommand = Command.run(pushCommand, {
  name: "hyprpay-push",
  version: "0.0.0",
});

const runStatusCommand = Command.run(statusCommand, {
  name: "hyprpay-status",
  version: "0.0.0",
});

const usage = Console.log("Uso: hyprpay <init|push|status> [--config hyprpay.config.ts]");

const commandArgv = (argv: readonly string[]) => [argv[0] ?? "hyprpay", argv[1] ?? "hyprpay", ...argv.slice(3)];

export const runHyprPayCli = (argv: readonly string[]) => {
  const command = argv[2];
  const args = commandArgv(argv);

  if (command === "init") return runInitCommand(args);
  if (command === "push") return runPushCommand(args);
  if (command === "status") return runStatusCommand(args).pipe(
    Effect.catch(error => Console.log(cliErrorMessage(error)).pipe(Effect.andThen(Effect.fail(error)))),
  );
  if (command === undefined || command === "--help" || command === "-h") return usage;

  return Console.log(`Comando desconhecido: ${command}`).pipe(Effect.andThen(usage));
};
