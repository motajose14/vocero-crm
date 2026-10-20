import { scheduleAgentTurn } from "@/server/ai/pipeline";
import { isAiConfiguredFor } from "@/lib/ai/provider";
import { despachoActivo } from "@/server/brains/config";
import { despacharAlCerebro } from "@/server/dispatch/encolar";
import { eq } from "drizzle-orm";
import { getDb, schema } from "@/lib/db";

/**
 * Punto de enganche del turno tras la ingesta de un mensaje entrante REAL (las
 * conversaciones del Laboratorio invocan el pipeline directamente, sin
 * debounce).
 *
 * 021 — Con un cerebro configurado (`BRAIN_DISPATCH_URL` + `BOT_API_KEY`) el
 * turno no se piensa aquí: se encola un despacho y el worker se lo entrega. Los
 * dos caminos son excluyentes: mientras el despacho está activo el agente
 * incluido no contesta, tenga o no proveedor de IA e interruptor encendido. Es
 * lo que evita la doble respuesta sin depender de que alguien se acuerde de
 * apagar uno.
 *
 * 025 — `messageId` es el entrante que provoca el turno. Quien lo lleve —el
 * despacho en su fila, el agente incluido en su coalesce— lo anota como algo
 * que DEBE: si el cliente escribe mientras se piensa la respuesta a lo
 * anterior, ese mensaje queda detrás de ella y sin la nota se da por atendido.
 */
export async function maybeRunAgentTurn(
  conversationId: string,
  organizationId: string,
  messageId: string
): Promise<void> {
  // 031 — conversación sobre cuota del plan: no se agenda turno NI se
  // despacha al cerebro externo. El chat nacido bloqueado no responde (ni IA
  // ni persona) hasta que la organización vuelva a tener margen; ahorrarse
  // aquí el turno ahorra tokens y un despacho que nadie podría contestar.
  // OJO: no es la guarda del envío — ésta se consulta en el nacimiento del
  // turno, antes de gastar nada.
  if (await conversacionBloqueada(conversationId)) return;

  if (despachoActivo()) {
    await despacharAlCerebro(conversationId, organizationId, messageId);
    return;
  }
  if (!(await isAiConfiguredFor(organizationId))) return;
  scheduleAgentTurn(conversationId, messageId);
}

/** ¿Está la conversación sobre el límite del plan (chat bloqueado)? */
async function conversacionBloqueada(conversationId: string): Promise<boolean> {
  const [fila] = await getDb()
    .select({ planBlocked: schema.conversation.planBlocked })
    .from(schema.conversation)
    .where(eq(schema.conversation.id, conversationId))
    .limit(1);
  // Sin fila no hay turno que agendar de todos modos.
  return fila?.planBlocked === true;
}
