import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { PlanUsoClient } from "@/components/plan-uso-client";

/**
 * `<main>` del AppShell es `overflow-hidden` sin padding: esta pantalla debe
 * llevar su propio cascarón (encabezado + área con scroll y padding), igual
 * que Resultados y Agente. Sin él el contenido queda pegado al borde y se
 * corta al pasar la altura de la ventana.
 */
describe("PlanUsoClient", () => {
  it("envuelve la pantalla en el cascarón con encabezado y área con scroll y padding", () => {
    const html = renderToStaticMarkup(React.createElement(PlanUsoClient));

    expect(html).toContain("flex h-full flex-col");
    expect(html).toContain("overflow-y-auto p-4 sm:p-6");
    expect(html).toContain("Plan y uso");
    expect(html).toContain('role="status"');
  });
});
