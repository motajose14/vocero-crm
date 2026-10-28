import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { UsoCliente } from "@/components/admin/uso-cliente";

describe("UsoCliente", () => {
  it("explica el periodo UTC y el reinicio del contador de conversaciones", () => {
    const markup = renderToStaticMarkup(
      createElement(UsoCliente, {
        uso: {
          contacts: 4,
          members: 1,
          channels: 1,
          conversationsThisMonth: 12,
        },
        limites: {
          maxContacts: 100,
          maxMembers: 5,
          maxChannels: 3,
          maxConversationsMonth: 50,
        },
      })
    );

    expect(markup).toContain(
      "Las conversaciones se cuentan por mes calendario UTC; el contador se reinicia el día 1."
    );
  });

  it("muestra uso accesible frente al límite y explica la consecuencia al agotarlo", () => {
    const markup = renderToStaticMarkup(
      createElement(UsoCliente, {
        uso: {
          contacts: 100,
          members: 5,
          channels: 3,
          conversationsThisMonth: 50,
        },
        limites: {
          maxContacts: 100,
          maxMembers: 5,
          maxChannels: 3,
          maxConversationsMonth: 50,
        },
      })
    );

    expect(markup.match(/role="progressbar"/g)).toHaveLength(4);
    expect(markup).toContain('aria-label="Contactos: 100 de 100"');
    expect(markup).toContain('aria-valuenow="100"');
    expect(markup).toContain('aria-valuemax="100"');
    expect(markup).toContain("Límite alcanzado.");
    expect(markup).toContain(
      "Límite alcanzado. No se pueden crear contactos manualmente ni importar más. Los contactos que llegan por webhook siguen guardándose, pero sus chats nuevos pueden quedar bloqueados."
    );
    expect(markup).toContain("No se pueden invitar más miembros.");
    expect(markup).toContain("No se pueden conectar canales nuevos.");
    expect(markup).toContain(
      "Al superar el límite, las conversaciones nuevas se crean, pero su chat queda bloqueado. Los mensajes entrantes siguen llegando."
    );
  });
});
