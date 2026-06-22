import { readdir, readFile } from "node:fs/promises";
import { join, relative, sep } from "node:path";
import ts from "typescript";

const workspaceRoot = process.cwd();
const sourceRoots = ["core", "gateways", "stores", "integrations"];
const productionBoundaryAllowlist = new Set([
  "core/cli/src/index.ts",
  "integrations/better-auth/src/server.ts",
]);

const ignoredSegments = new Set(["dist", "node_modules", ".nx", ".git"]);

interface Violation {
  readonly file: string;
  readonly line: number;
  readonly message: string;
}

const toPosix = (path: string): string => path.split(sep).join("/");

const isIgnoredPath = (path: string): boolean =>
  path
    .split(sep)
    .some(segment => ignoredSegments.has(segment) || segment.endsWith(".tsbuildinfo"));

const isProductionFile = (path: string): boolean => !path.endsWith(".test.ts") && !path.includes(`${sep}test${sep}`);

const collectTypeScriptFiles = async (directory: string): Promise<readonly string[]> => {
  const entries = await readdir(directory, { withFileTypes: true });
  const files: string[] = [];

  for (const entry of entries) {
    const path = join(directory, entry.name);

    if (isIgnoredPath(path)) {
      continue;
    }

    if (entry.isDirectory()) {
      files.push(...await collectTypeScriptFiles(path));
      continue;
    }

    if (entry.isFile() && entry.name.endsWith(".ts")) {
      files.push(path);
    }
  }

  return files;
};

const location = (sourceFile: ts.SourceFile, node: ts.Node) => {
  const position = sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile));
  return position.line + 1;
};

const isEffectRuntimeCall = (node: ts.CallExpression): boolean => {
  const expression = node.expression;

  if (!ts.isPropertyAccessExpression(expression)) {
    return false;
  }

  if (!ts.isIdentifier(expression.expression) || expression.expression.text !== "Effect") {
    return false;
  }

  return expression.name.text === "runPromise" || expression.name.text === "runPromiseExit" || expression.name.text === "runSync";
};

const isProvideCall = (node: ts.CallExpression): boolean => {
  const expression = node.expression;
  return (
    ts.isPropertyAccessExpression(expression) &&
    ts.isIdentifier(expression.expression) &&
    expression.expression.text === "Effect" &&
    expression.name.text === "provide"
  );
};

const hasOnlyReexports = (sourceFile: ts.SourceFile): boolean => {
  const statements = sourceFile.statements.filter(statement => statement.kind !== ts.SyntaxKind.EndOfFileToken);

  if (statements.length === 0) {
    return false;
  }

  return statements.every(statement => {
    if (!ts.isExportDeclaration(statement)) {
      return false;
    }

    return statement.moduleSpecifier !== undefined;
  });
};

const inspectFile = async (file: string): Promise<readonly Violation[]> => {
  const source = await readFile(file, "utf8");
  const sourceFile = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
  const relativeFile = toPosix(relative(workspaceRoot, file));
  const violations: Violation[] = [];

  if (!isProductionFile(file)) {
    return violations;
  }

  if (hasOnlyReexports(sourceFile)) {
    violations.push({ file: relativeFile, line: 1, message: "barrel-only file" });
  }

  const allowRuntimeBoundary = productionBoundaryAllowlist.has(relativeFile);

  const visit = (node: ts.Node): void => {
    if (ts.isAsExpression(node) || ts.isTypeAssertionExpression(node)) {
      violations.push({ file: relativeFile, line: location(sourceFile, node), message: "TypeScript cast in production" });
    }

    if (ts.isTryStatement(node)) {
      violations.push({ file: relativeFile, line: location(sourceFile, node), message: "try/catch in production" });
    }

    if (ts.isThrowStatement(node)) {
      violations.push({ file: relativeFile, line: location(sourceFile, node), message: "throw in production" });
    }

    if (ts.isCallExpression(node) && isEffectRuntimeCall(node) && !allowRuntimeBoundary) {
      violations.push({ file: relativeFile, line: location(sourceFile, node), message: "Effect runtime call outside explicit boundary" });
    }

    if (ts.isCallExpression(node) && isProvideCall(node) && !allowRuntimeBoundary) {
      violations.push({ file: relativeFile, line: location(sourceFile, node), message: "Effect.provide outside explicit boundary" });
    }

    ts.forEachChild(node, visit);
  };

  visit(sourceFile);

  return violations;
};

const files = (await Promise.all(sourceRoots.map(root => collectTypeScriptFiles(join(workspaceRoot, root))))).flat();
const violations = (await Promise.all(files.map(inspectFile))).flat();

if (violations.length > 0) {
  for (const violation of violations) {
    console.error(`${violation.file}:${violation.line}: ${violation.message}`);
  }
  process.exitCode = 1;
}
