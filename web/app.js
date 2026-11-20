const history = document.getElementById("history");
const composer = document.getElementById("composer");
const input = document.getElementById("input");
const sendBtn = document.getElementById("send");
const thinking = document.getElementById("thinking");
const summary = document.getElementById("summary");
const health = document.getElementById("health");

let sessionId = null;

function addMessage(role, text) {
  const wrap = document.createElement("div");
  wrap.className = `msg ${role}`;
  const bubble = document.createElement("div");
  bubble.className = "bubble";
  const match = role === "assistant" ? text.match(/^([\s\S]*?)\n\n```agent-switch\nbuild\n```$/) : null;
  bubble.textContent = match ? `${match[1]}\n\nBuild no está disponible en esta aplicación.` : text;
  wrap.appendChild(bubble);
  history.appendChild(wrap);
  history.scrollTop = history.scrollHeight;
}

function addToolCall(call) {
  const details = document.createElement("details");
  details.className = "tool";
  const summaryEl = document.createElement("summary");
  summaryEl.textContent = `Herramienta: ${call.name}`;
  details.appendChild(summaryEl);
  const pre = document.createElement("pre");
  pre.textContent = `argumentos: ${JSON.stringify(call.args)}\nresultado: ${call.result}`;
  details.appendChild(pre);
  history.appendChild(details);
  history.scrollTop = history.scrollHeight;
}

function addConfirmation() {
  const div = document.createElement("div");
  div.className = "confirm";
  div.textContent = "Este caso requiere tu confirmación explícita antes de simular cualquier envío.";
  history.appendChild(div);
}

function updateSummary(toolCalls) {
  const paquete = toolCalls.find((c) => c.name === "proveedor_armar_paquete");
  if (!paquete) return;
  try {
    const data = JSON.parse(paquete.result);
    if (!data.ok) return;
    const listo = data.data.listo_para_firma ? "listo" : "bloqueado";
    summary.replaceChildren();
    const title = document.createElement("h2");
    title.textContent = "Estado";
    const estado = document.createElement("p");
    estado.textContent = `Paquete: ${listo}`;
    const lista = document.createElement("ul");
    for (const item of data.data.checklist) {
      const li = document.createElement("li");
      li.textContent = item.replace(/^[-*]\s*/, "");
      lista.appendChild(li);
    }
    summary.append(title, estado, lista);
  } catch {
    /* ignore */
  }
}

async function sendMessage(text) {
  addMessage("user", text);
  thinking.hidden = false;
  sendBtn.disabled = true;
  try {
    const res = await fetch("/api/chat", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ sessionId, message: text }),
    });
    const data = await res.json();
    sessionId = data.sessionId ?? sessionId;
    for (const call of data.toolCalls ?? []) addToolCall(call);
    addMessage("assistant", data.reply ?? "(sin respuesta)");
    if (data.needsConfirmation) addConfirmation();
    updateSummary(data.toolCalls ?? []);
  } catch (err) {
    addMessage("assistant", `No pude contactar al servidor: ${err.message}`);
  } finally {
    thinking.hidden = true;
    sendBtn.disabled = false;
    input.focus();
  }
}

composer.addEventListener("submit", (e) => {
  e.preventDefault();
  const text = input.value.trim();
  if (!text) return;
  input.value = "";
  sendMessage(text);
});

fetch("/api/health")
  .then((r) => r.json())
  .then((d) => {
    health.textContent = `Proveedor: ${d.provider} · ${d.model}`;
  })
  .catch(() => {
    health.textContent = "Proveedor no disponible";
  });