import { readFileSync } from "node:fs";
import path from "node:path";
import ts from "typescript";
import { describe, expect, it } from "vitest";

const SOURCE = path.join(process.cwd(), "src/components/admin/planes-client.tsx");
const sourceText = readFileSync(SOURCE, "utf8");
const sourceFile = ts.createSourceFile(
  SOURCE,
  sourceText,
  ts.ScriptTarget.Latest,
  true,
  ts.ScriptKind.TSX
);

function jsxElementsWithRole(role: string): ts.JsxElement[] {
  const matches: ts.JsxElement[] = [];
  function visit(node: ts.Node) {
    if (ts.isJsxElement(node)) {
      const hasRole = node.openingElement.attributes.properties.some(
        (property) =>
          ts.isJsxAttribute(property) &&
          property.name.getText(sourceFile) === "role" &&
          property.initializer &&
          ts.isStringLiteral(property.initializer) &&
          property.initializer.text === role
      );
      if (hasRole) matches.push(node);
    }
    ts.forEachChild(node, visit);
  }
  visit(sourceFile);
  return matches;
}

function renderedContractText(node: ts.Node): string {
  const fragments: string[] = [];
  function visit(child: ts.Node) {
    if (ts.isJsxText(child)) fragments.push(child.text);
    if (ts.isStringLiteral(child) || ts.isNoSubstitutionTemplateLiteral(child)) {
      fragments.push(child.text);
    }
    ts.forEachChild(child, visit);
  }
  visit(node);
  return fragments.join(" ").replace(/\s+/g, " ").trim();
}

describe("editor de planes: contratos accesibles de guardado y borrado", () => {
  it("expone guardando, guardado y error por medio de estados accesibles", () => {
    const status = jsxElementsWithRole("status").map(renderedContractText).join(" ");
    const alerts = jsxElementsWithRole("alert").map(renderedContractText).join(" ");

    expect(status).toMatch(/Guardando/);
    expect(status).toMatch(/guardado/i);
    expect(alerts).toMatch(/guardar|plan/i);
  });

  it("pide confirmación nombrando el plan y permite cancelar antes de borrar", () => {
    const dialogs = jsxElementsWithRole("dialog");
    expect(dialogs).toHaveLength(1);
    const dialog = dialogs[0]!;
    const contents = renderedContractText(dialog);
    const dialogSource = dialog.getText(sourceFile);

    expect(contents).toMatch(/plan/i);
    expect(dialogSource).toContain("planAEliminar.name");
    expect(contents).toMatch(/Cancelar/);
    expect(contents).toMatch(/asignad|organizaciones/i);
    expect(contents).toMatch(/desactiv/i);
  });
});
