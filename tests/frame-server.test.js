const test = require("node:test");
const assert = require("node:assert/strict");
const http = require("node:http");
const { FrameServer } = require("../src/frame-server");

function request({ port, token, body = Buffer.from([0xff, 0xd8, 0xff, 0xd9]) }) {
  return new Promise((resolve, reject) => {
    const req = http.request({
      host: "127.0.0.1",
      port,
      path: "/v1/frame",
      method: "POST",
      headers: { "Content-Type": "image/jpeg", Authorization: `Bearer ${token}`, "Content-Length": body.length },
    }, (res) => {
      res.resume();
      res.on("end", () => resolve(res.statusCode));
    });
    req.on("error", reject);
    req.end(body);
  });
}

test("LAN receiver rejects bad tokens and accepts an authenticated frame", async (context) => {
  let received = null;
  const server = new FrameServer({ token: "ABC123", port: 0, onFrame: (frame) => { received = frame; } });
  await server.start();
  context.after(() => server.stop());
  assert.equal(await request({ port: server.port, token: "WRONG" }), 401);
  assert.equal(await request({ port: server.port, token: "ABC123" }), 202);
  assert.equal(received.mime, "image/jpeg");
  assert.equal(server.info().connected, true);
});
