const http = require("http");
const os = require("os");

function localAddresses() {
  const found = [];
  for (const entries of Object.values(os.networkInterfaces())) {
    for (const entry of entries || []) {
      if (entry.family === "IPv4" && !entry.internal && !entry.address.startsWith("169.254.")) found.push(entry.address);
    }
  }
  return [...new Set(found)];
}

class FrameServer {
  constructor({ token, port = 43129, onFrame }) {
    this.token = token;
    this.port = port;
    this.onFrame = onFrame;
    this.server = null;
    this.lastFrame = null;
  }

  async start() {
    if (this.server) return this.info();
    this.server = http.createServer((req, res) => this.handle(req, res));
    await new Promise((resolve, reject) => {
      this.server.once("error", reject);
      this.server.listen(this.port, "0.0.0.0", resolve);
    });
    this.port = this.server.address().port;
    return this.info();
  }

  info() {
    return {
      port: this.port,
      addresses: localAddresses(),
      token: this.token,
      connected: Boolean(this.lastFrame && Date.now() - this.lastFrame.receivedAt < 5000),
      lastFrameAt: this.lastFrame?.receivedAt || null,
    };
  }

  setFrame(buffer, meta = {}) {
    this.lastFrame = {
      buffer,
      mime: meta.mime || "image/jpeg",
      width: Number(meta.width) || null,
      height: Number(meta.height) || null,
      source: meta.source || "iPad",
      receivedAt: Date.now(),
    };
    this.onFrame?.(this.lastFrame);
    return this.lastFrame;
  }

  handle(req, res) {
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Headers", "Authorization, Content-Type, X-Study-Token, X-Frame-Width, X-Frame-Height, X-Frame-Source");
    if (req.method === "OPTIONS") {
      res.writeHead(204);
      res.end();
      return;
    }
    if (req.method === "GET" && req.url === "/health") {
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ ok: true, connected: this.info().connected }));
      return;
    }
    if (req.method !== "POST" || req.url !== "/v1/frame") {
      res.writeHead(404);
      res.end("not found");
      return;
    }
    const supplied = String(req.headers.authorization || "").replace(/^Bearer\s+/i, "") || req.headers["x-study-token"];
    if (supplied !== this.token) {
      res.writeHead(401);
      res.end("invalid pairing token");
      return;
    }
    const mime = String(req.headers["content-type"] || "image/jpeg").split(";")[0];
    if (!new Set(["image/jpeg", "image/png", "image/webp"]).has(mime)) {
      res.writeHead(415);
      res.end("send a jpeg, png, or webp frame");
      return;
    }
    const parts = [];
    let size = 0;
    req.on("data", (part) => {
      size += part.length;
      if (size > 12 * 1024 * 1024) req.destroy(new Error("frame too large"));
      else parts.push(part);
    });
    req.on("end", () => {
      if (!parts.length) {
        res.writeHead(400);
        res.end("empty frame");
        return;
      }
      const frame = this.setFrame(Buffer.concat(parts), {
        mime,
        width: req.headers["x-frame-width"],
        height: req.headers["x-frame-height"],
        source: req.headers["x-frame-source"] || "iPad",
      });
      res.writeHead(202, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ ok: true, receivedAt: frame.receivedAt }));
    });
    req.on("error", () => {
      if (!res.headersSent) res.writeHead(413);
      res.end("frame rejected");
    });
  }

  stop() {
    this.server?.close();
    this.server = null;
  }
}

module.exports = { FrameServer, localAddresses };
