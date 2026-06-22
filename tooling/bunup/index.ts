import { rm, readFile } from "node:fs/promises";
import { dirname, join, relative } from "node:path";

export interface HyprPayBunupOptions {
  entrypoints?: readonly string[];
  outdir?: string;
  target?: "node" | "browser" | "bun";
  sourcemap?: boolean;
}

export const defineHyprPayBuild = (options: HyprPayBunupOptions = {}): Required<HyprPayBunupOptions> => ({
  entrypoints: [...(options.entrypoints ?? ["src/**/*.ts"])],
  outdir: options.outdir ?? "dist",
  target: options.target ?? "node",
  sourcemap: options.sourcemap ?? true,
});

interface ExportTarget {
  import?: string;
  types?: string;
}

interface PackageJson {
  name?: string;
  main?: string;
  exports?: Record<string, ExportTarget | string>;
  dependencies?: Record<string, string>;
  hyprpay?: { readonly sourceRoot?: string };
  peerDependencies?: Record<string, string>;
  optionalDependencies?: Record<string, string>;
}

const packageRoot = process.cwd();
const packageJsonPath = join(packageRoot, "package.json");

const readPackageJson = async (): Promise<PackageJson> => JSON.parse(await readFile(packageJsonPath, "utf8"));

const normalizePath = (path: string) => path.replace(/^\.\//, "");

const sourceFromDistImport = (distImport: string, sourceRoot = "src"): string => {
  const normalized = normalizePath(distImport);

  if (!normalized.startsWith("dist/") || !normalized.endsWith(".js")) {
    throw new Error(`Unsupported package export import path: ${distImport}`);
  }

  const relativeSource = normalized.replace(/^dist\//, "").replace(/\.js$/, ".ts");
  return sourceRoot === "." ? relativeSource : `${sourceRoot}/${relativeSource}`;
};

const collectDistImports = (packageJson: PackageJson): string[] => {
  const imports = new Set<string>();

  if (packageJson.exports !== undefined) {
    for (const target of Object.values(packageJson.exports)) {
      if (typeof target === "string") {
        imports.add(target);
        continue;
      }

      if (target.import !== undefined) {
        imports.add(target.import);
      }
    }
  }

  if (imports.size === 0 && packageJson.main !== undefined) {
    imports.add(packageJson.main);
  }

  return [...imports].map(normalizePath);
};

const collectExternalPackages = (packageJson: PackageJson): string[] => [
  ...Object.keys(packageJson.dependencies ?? {}),
  ...Object.keys(packageJson.peerDependencies ?? {}),
  ...Object.keys(packageJson.optionalDependencies ?? {}),
];

const run = async (cmd: readonly string[]) => {
  const proc = Bun.spawn(cmd, {
    cwd: packageRoot,
    stderr: "inherit",
    stdout: "inherit",
  });
  const exitCode = await proc.exited;

  if (exitCode !== 0) {
    throw new Error(`${cmd.join(" ")} failed with exit code ${exitCode}`);
  }
};

const buildEntrypoint = async (entrypoint: string, distImport: string, external: readonly string[]) => {
  const outdir = dirname(join(packageRoot, distImport));
  const result = await Bun.build({
    entrypoints: [join(packageRoot, entrypoint)],
    outdir,
    target: "node",
    format: "esm",
    splitting: false,
    sourcemap: "external",
    minify: false,
    packages: "external",
    external: [...external],
    naming: "[name].js",
  });

  if (!result.success) {
    for (const log of result.logs) {
      console.error(log);
    }

    throw new Error(`Failed to build ${relative(packageRoot, entrypoint)}`);
  }
};

const main = async () => {
  const packageJson = await readPackageJson();
  const distImports = collectDistImports(packageJson);

  if (distImports.length === 0) {
    console.log("No public JS entrypoints found; skipping build.");
    return;
  }

  await rm(join(packageRoot, "dist"), { recursive: true, force: true });

  const external = collectExternalPackages(packageJson);

  for (const distImport of distImports) {
    await buildEntrypoint(sourceFromDistImport(distImport, packageJson.hyprpay?.sourceRoot), distImport, external);
  }

  await run(["bunx", "tsc", "-p", "tsconfig.json", "--emitDeclarationOnly", "--declaration", "--declarationMap"]);
};

await main();
