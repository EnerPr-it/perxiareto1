export type RutaChat = "general" | "proveedor" | "derivar";

const herramientasArchivo = new Set(["read", "write", "edit", "glob", "grep", "bash"]);
const verbosEntrega = /\b(crea|crear|creame|haz|hacer|genera|generar|redacta|redactar|escribe|escribir|implementa|implementar|modifica|modificar|edita|editar|actualiza|actualizar|guarda|guardar|exporta|exportar|prepara|preparar|construye|construir|produce|producir|necesito|quiero)\b/;
const objetosEntrega = /\b(documento|informe|presentacion|diapositivas?|powerpoint|pptx?|hoja de calculo|excel|xlsx|archivo|pdf|codigo|script|funcion|componente|programa|sitio web|pagina web)\b|\b[\w-]+\.(?:md|txt|pdf|docx?|pptx?|xlsx?|csv|html|css|js|jsx|ts|tsx|py)\b/;
const solicitudEntrega = /\b(?:hazme|dame|entregame|pasame)\b.{0,100}\b(?:un|una|el|la)\b.{0,30}\b(?:documento|informe|presentacion|archivo|codigo|script|pdf|excel)\b/;
const preguntaInformativa = /^(?:\s*[¿?]?\s*)(?:que|como|cual|cuando|donde|por que|explica|explicame|describe|puedes explicarme)\b/;
const trabajoProveedor = /\b(?:caso|solicitud|soportes?|formulario|paquete|registro)\b.{0,100}\b(?:proveedor|firma|envio|cliente|co-|ec-|hn-|pa-)\b|\b(?:co-industrias-delta|ec-corp-andina|hn-agroexport-sula|pa-logistica-istmo)\b|\b(?:proveedor|cliente)\b.{0,100}\b(?:caso|solicitud|soportes?|formulario|paquete|registro)\b/;

export function decidirRuta(mensaje: string, herramientasDisponibles: readonly string[]): RutaChat {
  const texto = mensaje.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  if (trabajoProveedor.test(texto)) return "proveedor";
  if (preguntaInformativa.test(texto) && !/\b(?:y|ademas|tambien|luego)\b.{0,100}\b(?:crea|haz|genera|escribe|implementa|modifica|guarda)\b/.test(texto)) return "general";
  const requiereEntrega = (verbosEntrega.test(texto) && objetosEntrega.test(texto)) || solicitudEntrega.test(texto);
  if (!requiereEntrega) return "general";
  return herramientasDisponibles.some((nombre) => herramientasArchivo.has(nombre)) ? "general" : "derivar";
}

export function respuestaCambioAgente(): string {
  return "El agente Build puede hacerlo.\n\n```agent-switch\nbuild\n```";
}
