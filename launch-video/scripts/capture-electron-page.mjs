import fs from "node:fs";
import WebSocket from "ws";

const output = process.argv[2];
if (!output) throw new Error("Pass an output path.");

const targets = await (await fetch("http://localhost:9222/json/list")).json();
const target = targets.find((item) => item.type === "page");
if (!target) throw new Error("No Electron renderer target was found.");

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

await new Promise((resolve) => setTimeout(resolve, 350));
const result = await call("Page.captureScreenshot", { format: "png", captureBeyondViewport: true });
fs.writeFileSync(output, Buffer.from(result.data, "base64"));
console.log(output);
socket.close();
