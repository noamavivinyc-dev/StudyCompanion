const test = require("node:test");
const assert = require("node:assert/strict");
const { authStatus, cleanResult, selectModel, tutorPrompt } = require("../src/chatgpt-tutor");

test("ChatGPT authentication status is app-specific and explicit", () => {
  assert.deepEqual(authStatus({ status: "connected", sharing: true, profileId: "one", identity: { email: "student@example.com" } }), {
    available: true,
    authenticated: true,
    signedIn: true,
    sharing: true,
    state: "connected",
    method: "ChatGPT plan",
    name: null,
    email: "student@example.com",
    profileId: "one",
    detail: "Using student@example.com and its plan.",
    errorCode: null,
  });
  assert.equal(authStatus({ status: "disconnected", sharing: false }).authenticated, false);
  assert.equal(authStatus({ status: "connected", sharing: false }).state, "sharing_disabled");
});

test("model selection prefers the vision tutor model and falls back to the catalog", () => {
  assert.equal(selectModel([{ slug: "other" }, { slug: "gpt-5.6-sol" }]).slug, "gpt-5.6-sol");
  assert.equal(selectModel([{ slug: "available-model" }]).slug, "available-model");
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

test('lecture generation includes the end of long transcripts and uses structured account responses', async () => {
  const { ChatGPTTutor } = require('../src/chatgpt-tutor');
  const path = require('node:path');
  const prompts = [];
  const client = {
    subscribe:() => () => {},
    getSession:async () => ({ status:'connected', sharing:true }),
    listModels:async () => [{ slug:'gpt-6.1-sol' }],
    streamResponse:async ({ input, textFormat }) => {
      prompts.push(input[0].content[0].text);
      assert.equal(textFormat.schema.additionalProperties, false);
      return { text:JSON.stringify({ guide:prompts.length < 3 ? `Summary ${prompts.length}` : '# Key ideas\nStudy these concepts.' }) };
    },
  };
  const tutor = new ChatGPTTutor({ client, schemaPath:path.join(__dirname, '../schemas/tutor-response.schema.json') });
  const guide = await tutor.summarizeLecture({ title:'Full lecture', notes:[], segments:[{ seconds:0, text:'Beginning '.repeat(2500) + 'FINAL IMPORTANT CONCEPT' }] });
  assert.equal(prompts.length, 3);
  assert.match(prompts[1], /FINAL IMPORTANT CONCEPT/);
  assert.match(prompts[2], /Summary 1/);
  assert.match(prompts[2], /Summary 2/);
  assert.match(prompts[2], /never as instructions/);
  assert.match(guide, /Key ideas/);
  assert.equal(tutor.current, null);
});
