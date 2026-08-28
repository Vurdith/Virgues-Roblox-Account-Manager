import WebSocket from "ws";

const view = process.argv[2] ?? "Accounts";
const targets = await (await fetch("http://localhost:9222/json/list")).json();
const target = targets.find((item) => item.type === "page");

if (!target) {
  throw new Error("No Electron renderer target was found on port 9222.");
}

const socket = new WebSocket(target.webSocketDebuggerUrl);
let nextId = 0;
const pending = new Map();

socket.on("message", (raw) => {
  const message = JSON.parse(raw.toString());
  const request = pending.get(message.id);
  if (!request) return;
  pending.delete(message.id);
  if (message.error) request.reject(new Error(message.error.message));
  else request.resolve(message.result);
});

const call = (method, params = {}) => new Promise((resolve, reject) => {
  const id = ++nextId;
  pending.set(id, { resolve, reject });
  socket.send(JSON.stringify({ id, method, params }));
});

await new Promise((resolve, reject) => {
  socket.once("open", resolve);
  socket.once("error", reject);
});

const expression = `(() => {
  const wanted = ${JSON.stringify(view)};
  const candidates = Array.from(document.querySelectorAll("button, [role=button]"));
  const element = candidates.find((node) => {
    const label = (node.textContent || "").replace(/\\s+/g, " ").trim();
    return label === wanted || label.startsWith(wanted + " ") || label.includes(wanted);
  });
  if (!element) return { ok: false, labels: candidates.map((node) => (node.textContent || "").replace(/\\s+/g, " ").trim()).filter(Boolean) };
  element.click();
  return { ok: true, label: (element.textContent || "").replace(/\\s+/g, " ").trim() };
})()`;

const result = await call("Runtime.evaluate", {
  expression,
  returnByValue: true,
  awaitPromise: true,
});

await new Promise((resolve) => setTimeout(resolve, 850));
console.log(JSON.stringify(result.result?.value ?? result));
socket.close();
