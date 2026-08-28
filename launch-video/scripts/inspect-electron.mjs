import WebSocket from "ws";

const targets = await (await fetch("http://localhost:9222/json/list")).json();
const target = targets.find((item) => item.type === "page");
const socket = new WebSocket(target.webSocketDebuggerUrl);
let nextId = 0;
const pending = new Map();
socket.on("message", (raw) => {
  const message = JSON.parse(raw.toString());
  const request = pending.get(message.id);
  if (!request) return;
  pending.delete(message.id);
  request.resolve(message.result);
});
const call = (method, params = {}) => new Promise((resolve) => {
  const id = ++nextId;
  pending.set(id, { resolve });
  socket.send(JSON.stringify({ id, method, params }));
});
await new Promise((resolve, reject) => {
  socket.once("open", resolve);
  socket.once("error", reject);
});
const expression = `Array.from(document.querySelectorAll("button, [role=button]")).map((node) => ({ text: (node.textContent || "").replace(/\\s+/g, " ").trim(), html: node.outerHTML.slice(0, 600), rect: node.getBoundingClientRect().toJSON() })).filter((item) => item.text)`;
const result = await call("Runtime.evaluate", { expression, returnByValue: true });
console.log(JSON.stringify(result.result?.value ?? result, null, 2));
socket.close();
