/**
 * 031 — Conceder (o quitar) el flag de superadmin a una cuenta.
 *
 * Es el único camino para entrar a `/admin`: no hay UI que encienda el flag,
 * así que una instalación nueva siempre arranca con cero superadmins y nadie
 * puede escalarse a sí mismo desde dentro.
 *
 * Uso:
 *   node --env-file=.env scripts/superadmin-grant.mjs correo@ejemplo.com
 *   node --env-file=.env scripts/superadmin-grant.mjs correo@ejemplo.com off
 *
 * Sale con código distinto de 0 si el correo no existe o si la BD no responde,
 * para que un despliegue automatizado note el fallo.
 */
import postgres from "postgres";

const [, , email, accionRaw] = process.argv;
const apagar = (accionRaw ?? "on").toLowerCase() === "off";

if (!email || !email.includes("@")) {
  console.error(
    "Uso: node --env-file=.env scripts/superadmin-grant.mjs <correo> [on|off]"
  );
  process.exit(1);
}

const url = process.env.DATABASE_URL;
if (!url) {
  console.error("[superadmin-grant] DATABASE_URL no está definida");
  process.exit(1);
}

const sql = postgres(url, {
  max: 1,
  onnotice: () => {},
  // TimeZone UTC: invariante de tiempo del proyecto.
  connection: { TimeZone: "UTC" },
});

try {
  const filas = await sql`
    UPDATE "user"
    SET is_superadmin = ${!apagar}
    WHERE lower(email) = lower(${email})
    RETURNING id, email, is_superadmin
  `;
  const fila = filas[0];
  if (!fila) {
    console.error(`[superadmin-grant] no existe ninguna cuenta con el correo ${email}`);
    await sql.end();
    process.exit(1);
  }
  console.log(
    `[superadmin-grant] ${fila.email} → is_superadmin=${fila.is_superadmin}`
  );
  await sql.end();
  process.exit(0);
} catch (err) {
  console.error("[superadmin-grant] falló:", err instanceof Error ? err.message : err);
  await sql.end().catch(() => {});
  process.exit(1);
}
