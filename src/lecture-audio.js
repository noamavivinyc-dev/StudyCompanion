const fs = require("node:fs");
const { Readable } = require("node:stream");

function audioResponse(file, request) {
  const size = fs.statSync(file).size;
  let start = 0; let end = size - 1;
  const range = request.headers.get("range");
  if (range) {
    const match = /^bytes=(\d*)-(\d*)$/.exec(range);
    if (!match || (!match[1] && !match[2])) return new Response(null, { status: 416, headers: { "Content-Range": `bytes */${size}` } });
    start = match[1] ? Number(match[1]) : Math.max(0, size - Number(match[2]));
    end = match[1] && match[2] ? Math.min(size - 1, Number(match[2])) : size - 1;
    if (start >= size || end < start) return new Response(null, { status: 416, headers: { "Content-Range": `bytes */${size}` } });
  }
  const headers = { "Content-Type": "audio/wav", "Content-Length": String(end - start + 1), "Accept-Ranges": "bytes" };
  if (range) headers["Content-Range"] = `bytes ${start}-${end}/${size}`;
  return new Response(request.method === "HEAD" ? null : Readable.toWeb(fs.createReadStream(file, { start, end })), { status: range ? 206 : 200, headers });
}

module.exports = { audioResponse };
