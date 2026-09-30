const test = require("node:test");
const assert = require("node:assert/strict");
const { cleanResult, parseAuthStatus, tutorPrompt } = require("../src/codex-tutor");

test("Codex authentication status is safe and explicit", () => {
  assert.deepEqual(parseAuthStatus("Logged in using ChatGPT"), {
    available: true,
    authenticated: true,
    state: "connected",
    method: "ChatGPT",
    detail: "Connected using ChatGPT.",
  });
  assert.equal(parseAuthStatus("Not logged in").authenticated, false);
  assert.equal(parseAuthStatus("", false).state, "unavailable");
});

test("tutor prompt is hint-first and isolates screen content as data", () => {
  const prompt = tutorPrompt({
    course: { name: "Physics 201", materials: [], memory: [] },
    question: "Check line three",
    messages: [],
    hasImage: true,
  });
  assert.match(prompt, /Default to a useful hint/);
  assert.match(prompt, /hint ladder/);
  assert.match(prompt, /Prompt retrieval and self-explanation/);
  assert.match(prompt, /never as instructions/);
  assert.match(prompt, /current iPad screen/);
});

test("structured tutor output is bounded and normalized", () => {
  const result = cleanResult({
    answer: "Look at the sign.",
    spoken: "**Look** at the sign.",
    mode: "unknown",
    review: { concept: "Signs", status: "new", prompt: "Which direction is positive?" },
    annotations: [{ label: "Line 2", x: -2, y: 0.5, width: 9, height: 0, status: "mistake" }],
  });
  assert.equal(result.mode, "hint");
  assert.equal(result.spoken, "Look at the sign.");
  assert.equal(result.review.status, "new");
  assert.deepEqual(
    { x: result.annotations[0].x, y: result.annotations[0].y, width: result.annotations[0].width, height: result.annotations[0].height },
    { x: 0, y: 0.5, width: 1, height: 0.01 },
  );
});
