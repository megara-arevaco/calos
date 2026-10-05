import assert from "node:assert/strict";
import { readdir, readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";
import ts from "typescript";

async function sourceFiles(directory: string): Promise<string[]> {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = await Promise.all(
    entries.map((entry) =>
      entry.isDirectory()
        ? sourceFiles(join(directory, entry.name))
        : Promise.resolve(
            /\.tsx?$/.test(entry.name) ? [join(directory, entry.name)] : [],
          ),
    ),
  );
  return files.flat();
}

test("renderer keeps Node, Electron and runtime core behind IPC query adapters", async () => {
  const renderer = join(dirname(fileURLToPath(import.meta.url)), "../renderer");

  for (const file of await sourceFiles(renderer)) {
    const source = ts.createSourceFile(
      file,
      await readFile(file, "utf8"),
      ts.ScriptTarget.Latest,
      true,
    );
    const visit = (node: ts.Node) => {
      if (ts.isImportDeclaration(node) && ts.isStringLiteral(node.moduleSpecifier)) {
        const module = node.moduleSpecifier.text;
        const clause = node.importClause;
        const named = clause?.namedBindings;
        const typeOnly =
          clause?.isTypeOnly ||
          (named &&
            ts.isNamedImports(named) &&
            named.elements.every((element) => element.isTypeOnly));

        if (
          module === "electron" ||
          module.startsWith("node:") ||
          module === "@calos/core"
        ) {
          assert.ok(typeOnly, `Runtime import ${module} in ${file}`);
        }
      }
      if (
        ts.isPropertyAccessExpression(node) &&
        node.expression.getText(source) === "window" &&
        node.name.text === "calos"
      ) {
        assert.ok(
          file.includes("/queries/"),
          `IPC call outside query adapter: ${file}`,
        );
      }
      ts.forEachChild(node, visit);
    };
    visit(source);
  }
});
