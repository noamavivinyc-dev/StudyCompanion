const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");
const { pathToFileURL } = require("node:url");

test("vendored SIWC response client sends vision input with structured output and no storage", async () => {
  const moduleUrl = pathToFileURL(path.join(__dirname, "..", "vendor", "siwc-local", "dist", "responses.js"));
  const { streamResponse } = await import(moduleUrl.href);
  const originalFetch = global.fetch;
  let request;
  global.fetch = async (_url, init) => {
    request = JSON.parse(init.body);
    return new Response([
      `data: ${JSON.stringify({ type: "response.output_text.delta", delta: "{\"answer\":\"hint\"}" })}`,
      "",
      `data: ${JSON.stringify({ type: "response.completed" })}`,
      "",
    ].join("\n"), { status: 200, headers: { "content-type": "text/event-stream" } });
  };
  try {
    const result = await streamResponse("oauth-token", {
      model: "gpt-5.6-sol",
      input: [{ role: "user", content: [
        { type: "input_text", text: "Check this step" },
        { type: "input_image", image_url: "data:image/png;base64,AA==", detail: "high" },
      ] }],
      textFormat: { type: "json_schema", name: "answer", strict: true, schema: { type: "object" } },
    }, new AbortController().signal);
    assert.equal(result.text, '{"answer":"hint"}');
    assert.equal(request.store, false);
    assert.equal(request.stream, true);
    assert.equal(request.input[0].content[1].type, "input_image");
    assert.equal(request.text.format.type, "json_schema");
  } finally {
    global.fetch = originalFetch;
  }
});
