import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { CURRENCIES } from "@/lib/money";

/**
 * 031 — Guardarraíl de moneda: ninguna pantalla cablea la suya.
 *
 * Cada instancia elige la moneda en Ajustes → Marca, y `formatMoneyCents` la
 * recibe explícitamente. Un literal `"MXN"` dentro de un componente es una
 * pantalla que se quedó en la moneda de OTRO negocio: el día que el dueño
 * cambie Marca, ese número seguirá mintiendo — y como el resto del sistema sí
 * le obedece, la mentira queda sola en esa esquina.
 *
 * Dos decisiones del escaneo, ambas a propósito:
 *
 *   - Se ignoran los bloques `/* … *\/` porque son prosa de documentación, no
 *     código cableado. Los comentarios de línea NO se ignoran: hacerlo exigiría
 *     distinguir un `//` de un comentario de uno vivo dentro de un string como
 *     `"https://…"`, y un falso negativo ahí dejaría pasar el defecto que este
 *     test existe para cazar. Un falso positivo molesta; uno negativo falla.
 *
 *   - Dos archivos quedan exentos, y los dos con razón:
 *       · `lib/money.ts` es el catálogo mismo: ahí vive la lista de monedas y
 *         su predeterminada. No puede citarse a sí mismo.
 *       · `server/seed/demo.ts` es CONTENIDO de la demostración: la Ferretería
 *         El Martillo es mexicana y sus mensajes cotizan en pesos. Es texto de
 *         un negocio ficticio, no una decisión de formato.
 */

const SRC = path.resolve(import.meta.dirname, "..", "..", "src");

/** Código de moneda como palabra entera. Las fronteras (`\b`) importan: sin
 *  ellas, la moneda nicaragüense `NIO` se comió a `ZERNIO_MESSAGE_EVENT`, y la
 *  lista saltaba de 2 infracciones reales a 102 falsas. */
const RE_CODIGO = new RegExp(`\\b(?:${CURRENCIES.join("|")})\\b`, "g");

/** Bloques de comentario, no anidados (JSDoc no anida). */
const RE_BLOQUE = /\/\*[\s\S]*?\*\//g;

/** Excepciones justificadas: catálogo y contenido de la demo. */
const EXENTOS = new Set(["lib/money.ts", "server/seed/demo.ts"]);

function archivosDe(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = path.join(dir, entry);
    if (statSync(full).isDirectory()) {
      out.push(...archivosDe(full));
    } else if (/\.(ts|tsx)$/.test(entry)) {
      out.push(full);
    }
  }
  return out;
}

/** Ruta relativa a `src/`, con `/` como separador. */
function relativo(full: string): string {
  return path.relative(SRC, full).split(path.sep).join("/");
}

/** `{ archivo, linea, texto }` por cada código de moneda que aparezca en código. */
function cableados(full: string): { archivo: string; linea: number; texto: string }[] {
  const out: { archivo: string; linea: number; texto: string }[] = [];
  readFileSync(full, "utf8")
    .replace(RE_BLOQUE, "")
    .split("\n")
    .forEach((texto, i) => {
      RE_CODIGO.lastIndex = 0;
      if (RE_CODIGO.test(texto)) {
        out.push({ archivo: relativo(full), linea: i + 1, texto: texto.trim() });
      }
    });
  return out;
}

const TODOS = archivosDe(SRC).filter((f) => !EXENTOS.has(relativo(f)));

const HALLADOS = TODOS.flatMap(cableados);

describe("guardarraíl: la moneda no se cablea en el código", () => {
  it("ningún archivo escribe un código de moneda literal", () => {
    const listado = HALLADOS.map((h) => `${h.archivo}:${h.linea} → ${h.texto}`).join("\n");
    expect(HALLADOS, `\n${listado}\n`).toHaveLength(0);
  });

  it("el escaneo sí mira archivos: no puede quedar vacío por accidente", () => {
    // Si `archivosDe` devolviera nada (ruta rota, cambio de estructura), la
    // prueba anterior pasaría en vano. Este clavo evita un verde vacío.
    expect(TODOS.length).toBeGreaterThan(100);
  });
});
