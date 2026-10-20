import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

/**
 * 031 — Guardarraíl del SaaS: el superadmin es la ÚNICA puerta que cruza
 * organizaciones.
 *
 * El aislamiento por tenant vive en `scoped()` (ver `tenant.test.ts`), pero
 * `scoped()` no puede impedir que aparezca UNA consulta nueva que mire a todas
 * las organizaciones a la vez — que es exactamente lo que hace un CRM roto
 * cuando alguien añade «un listado global» sin darse cuenta. Aquí se fija, en
 * el código fuente, qué superficie tiene ese permiso:
 *
 *   - `esSuperadmin` (el flag de plataforma) solo se lee desde `withAdmin`
 *     (que vive en `src/lib/api.ts`) y desde el layout `/admin`;
 *   - `withAdmin` solo se usa en las rutas `/api/admin/*`;
 *   - `usageByOrg` (recuentos de VARIAS organizaciones, sin `scoped()`) solo
 *     se llama desde `/api/admin/organizations`;
 *   - `crearCliente` y `crearOrgConDueño` (crean organización con dueño) solo
 *     se llaman desde esas mismas rutas.
 *
 * Si estás leyendo esto porque el test se puso rojo: no lo relajes. Si la
 * consulta que necesitas es de un cliente, `scoped()` ya te da el tenant; si
 * es de plataforma, `/api/admin` es el lugar — y verás que al añadir el
 * import aquí el test te obliga a decidirlo en voz alta.
 */

const SRC = path.resolve(import.meta.dirname, "..", "..", "src");

function archivosTs(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = path.join(dir, entry);
    if (statSync(full).isDirectory()) {
      out.push(...archivosTs(full));
    } else if (/\.(ts|tsx)$/.test(entry)) {
      out.push(full);
    }
  }
  return out;
}

const TODOS = archivosTs(SRC);

/** Ruta relativa a `src/`, con `/` como separador, para comparar legible. */
function relativo(full: string): string {
  return path.relative(SRC, full).split(path.sep).join("/");
}

/** Quiénes importan `simbolo` desde su módulo, como rutas relativas. */
function importadoresDe( modulo: string, simbolo: string ): string[] {
  const re = new RegExp(
    `import\\s*(?:type\\s*)?\\{[^}]*\\b${simbolo}\\b[^}]*\\}\\s*from\\s*["']${modulo.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}["']`,
    "m"
  );
  return TODOS.filter((f) => re.test(readFileSync(f, "utf8"))).map(relativo);
}

/** Solo la puerta de plataforma (`withAdmin`) y su layout leen el flag. */
const SUPERADMIN_PERMITIDO =
  // `withAdmin` vive aquí y es quien consulta el flag en el camino feliz;
  // el test siguiente fija que SOLO las rutas admin usen `withAdmin`, así
  // que el conjunto de las dos reglas deja el permiso confinado.
  // El panel es el segmento NORMAL `app/admin/` (no un route group): un
  // `(admin)` no agrega URL y el panel quedaría en `/clientes` y `/planes`,
  // fuera de su prefijo. El arnés e2e lo atrapó con un 404 en `/admin`.
  /^lib\/api\.ts$|^app\/api\/admin\/|^app\/admin\//;

describe("guardarraíl: el superadmin es la única puerta cross-org", () => {
  it("`esSuperadmin` solo se lee en /api/admin/* y /admin", () => {
    const importadores = importadoresDe("@/lib/auth/superadmin", "esSuperadmin");
    expect(importadores.length).toBeGreaterThan(0);
    for (const ruta of importadores) {
      expect(
        SUPERADMIN_PERMITIDO.test(ruta),
        `${ruta} lee el flag de superadmin fuera de la puerta de plataforma`
      ).toBe(true);
    }
  });

  it("`withAdmin` solo se usa en las rutas /api/admin/*", () => {
    const importadores = importadoresDe("@/lib/api", "withAdmin");
    expect(importadores.length).toBeGreaterThan(0);
    for (const ruta of importadores) {
      expect(
        ruta.startsWith("app/api/admin/"),
        `${ruta} usa withAdmin fuera de /api/admin`
      ).toBe(true);
    }
  });

  it("`usageByOrg` (recuentos de varias orgs) solo lo llama /api/admin/organizations", () => {
    const importadores = importadoresDe("@/server/plans/usage", "usageByOrg");
    expect(importadores).toEqual([
      "app/api/admin/organizations/route.ts",
    ]);
  });

  it("`crearCliente` (crea org con dueño) solo lo llama /api/admin/organizations", () => {
    const importadores = importadoresDe("@/server/plans/clientes", "crearCliente");
    expect(importadores).toEqual(["app/api/admin/organizations/route.ts"]);
  });

  it("`crearOrgConDueño` (crea org + dueño) solo lo llama el alta de clientes", () => {
    // La definición vive en `server/auth/on-signup.ts`; el registro público
    // no la importa porque está en el mismo archivo. El único IMPORTADOR es
    // el módulo de altas del superadmin, y esa ruta solo se alcanza tras
    // `withAdmin`.
    const importadores = importadoresDe(
      "@/server/auth/on-signup",
      "crearOrgConDueño"
    );
    expect(importadores).toEqual(["server/plans/clientes.ts"]);
  });
});
