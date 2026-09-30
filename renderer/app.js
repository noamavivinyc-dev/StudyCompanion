const $ = (selector) => document.querySelector(selector);
const $$ = (selector) => [...document.querySelectorAll(selector)];

let state = null;
let recording = false;
let mediaStream = null;
let audioContext = null;
let processor = null;
let audioChunks = [];
let audioStartedAt = 0;
let heardSpeech = false;
let silenceStartedAt = 0;
let selectedColor = "#168aad";
let toastTimer = null;
let editingCourseId = null;
let promptedForAccount = false;

const els = {
  courseList: $("#courseList"),
  courseTitle: $("#courseTitle"),
  sessionButton: $("#sessionButton"),
  materialsButton: $("#materialsButton"),
  accountButton: $("#accountButton"),
  accountButtonLabel: $("#accountButtonLabel"),
  screenImage: $("#screenImage"),
  emptyCapture: $("#emptyCapture"),
  annotationLayer: $("#annotationLayer"),
  frameMeta: $("#frameMeta"),
  connectionBadge: $("#connectionBadge"),
  pairingAddress: $("#pairingAddress"),
  pairingToken: $("#pairingToken"),
  questionInput: $("#questionInput"),
  sendButton: $("#sendButton"),
  micButton: $("#micButton"),
  voiceCaption: $("#voiceCaption"),
  conversation: $("#conversation"),
  tutorStatus: $("#tutorStatus"),
  tutorOrb: $(".tutor-orb"),
  memoryToggle: $("#memoryToggle"),
  handsFreeToggle: $("#handsFreeToggle"),
  muteButton: $("#muteButton"),
  contextSummary: $("#contextSummary"),
  aiLight: $("#aiLight"),
  courseDialog: $("#courseDialog"),
  libraryDialog: $("#libraryDialog"),
  libraryTitle: $("#libraryTitle"),
  materialList: $("#materialList"),
  coursePulse: $("#coursePulse"),
  librarySummary: $("#librarySummary"),
  voiceStatusChip: $("#voiceStatusChip"),
  guidanceButton: $("#guidanceButton"),
  confirmDialog: $("#confirmDialog"),
  accountDialog: $("#accountDialog"),
};

function escapeHtml(value) {
  return String(value || "").replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;" })[char]);
}

function richText(value) {
  return escapeHtml(value)
    .split(/\n\s*\n/)
    .map((part) => `<p>${part.replace(/\n/g, "<br>").replace(/\*\*(.*?)\*\*/g, "<strong>$1</strong>")}</p>`)
    .join("");
}

function showToast(error) {
  const message = String(error?.message || error || "Something went wrong").replace(/^Error invoking remote method '[^']+': Error:\s*/, "");
  $("#toast").textContent = message;
  $("#toast").classList.add("show");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => $("#toast").classList.remove("show"), 4200);
}

function activeCourse() {
  return state?.courses.find((course) => course.id === state.selectedCourseId) || state?.courses[0];
}

function formatDate(value, fallback = "No date") {
  if (!value) return fallback;
  const date = new Date(value);
  if (Number.isNaN(date.valueOf())) return fallback;
  return new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric", year: "numeric" }).format(date);
}

function dateInputValue(value) {
  const date = new Date(value);
  return Number.isNaN(date.valueOf()) ? "" : date.toISOString().slice(0, 10);
}

function render() {
  if (!state) return;
  const course = activeCourse();
  els.courseTitle.textContent = course?.name || "No course";
  els.courseList.innerHTML = state.courses.length ? state.courses.map((item) => `
    <div class="course-card-wrap" style="--course-color:${item.color}">
      <button class="course-card ${item.id === state.selectedCourseId ? "active" : ""}" data-course-id="${item.id}">
        <strong>${escapeHtml(item.shortName)}</strong>
        <span>${item.materialCount} material${item.materialCount === 1 ? "" : "s"}${item.reviewDueCount ? ` · ${item.reviewDueCount} due` : ""}</span>
      </button>
      <button class="course-edit-button" data-edit-course="${item.id}" aria-label="Edit ${escapeHtml(item.name)}">•••</button>
    </div>`).join("") : `<div class="empty-course-list">Create a course to keep its syllabus, notes, and study history together.</div>`;
  $$('[data-course-id]').forEach((button) => button.addEventListener("click", async () => {
    try { state = await window.study.selectCourse(button.dataset.courseId); render(); } catch (error) { showToast(error); }
  }));
  $$('[data-edit-course]').forEach((button) => button.addEventListener("click", () => openCourseDialog(state.courses.find((item) => item.id === button.dataset.editCourse))));

  const active = Boolean(state.activeSession);
  els.sessionButton.textContent = active ? "End session" : "Start session";
  els.sessionButton.classList.toggle("primary", !active);
  els.sessionButton.disabled = !active && !course;
  els.materialsButton.disabled = !course;
  els.sendButton.disabled = !active || state.tutorState === "thinking";
  els.memoryToggle.checked = state.settings.persistCourseMemory;
  els.handsFreeToggle.checked = state.settings.handsFree;
  els.muteButton.classList.toggle("muted", state.settings.muted);
  els.muteButton.textContent = state.settings.muted ? "Voice off" : "Voice on";
  els.guidanceButton.textContent = state.settings.showGuidance ? "Guidance on" : "Guidance off";
  els.annotationLayer.classList.toggle("guidance-hidden", !state.settings.showGuidance);
  renderAccountState();
  els.aiLight.classList.toggle("available", state.chatgpt.authenticated);
  els.aiLight.title = state.chatgpt.authenticated ? "Using your ChatGPT plan" : "ChatGPT account not connected";
  els.contextSummary.textContent = `${course?.materialCount || 0} material${course?.materialCount === 1 ? "" : "s"} · ${state.settings.persistCourseMemory ? `${course?.memoryCount || 0} saved memories` : "this session only"}`;
  updateReceiver(state.receiver);
  renderFrame(state.frame);
  renderMessages();
  updateTutorState(state.tutorState);
  updateVoiceUI();
  if (els.libraryDialog.open) renderLibrary();
  if (els.accountDialog.open) renderAccountDialog();
  if (!promptedForAccount && ["disconnected", "reauth_required", "sharing_disabled"].includes(state.chatgpt.state)) {
    promptedForAccount = true;
    setTimeout(openAccountDialog, 250);
  }
}

function renderAccountState() {
  const auth = state.chatgpt || {};
  const labels = {
    checking: "Checking ChatGPT…",
    connecting: "Signing in…",
    disconnecting: "Signing out…",
    disconnected: "Connect ChatGPT",
    reauth_required: "Reconnect ChatGPT",
    sharing_disabled: "Enable ChatGPT plan",
  };
  els.accountButtonLabel.textContent = auth.authenticated
    ? "ChatGPT connected"
    : labels[auth.state] || "Connect ChatGPT";
  els.accountButton.className = `account-button ${auth.authenticated ? "connected" : auth.state || "disconnected"}`;
}

function renderAccountDialog() {
  const auth = state.chatgpt || {};
  const connected = Boolean(auth.authenticated);
  const busy = ["checking", "connecting", "disconnecting"].includes(auth.state);
  $("#accountTitle").textContent = connected ? "Your AI connection is ready" : auth.state === "sharing_disabled" ? "Enable your ChatGPT plan" : auth.state === "reauth_required" ? "Reconnect ChatGPT" : "Connect your ChatGPT account";
  $("#accountIntro").textContent = connected
    ? "Study Companion sends tutoring requests through the ChatGPT plan connected specifically to this app."
    : "Your browser will open for the official Continue with ChatGPT flow. No Codex install or API key is required.";
  $("#accountStatusTitle").textContent = connected
    ? auth.email || auth.name || "ChatGPT account"
    : auth.state === "connecting" ? "Finish in your browser" : auth.state === "sharing_disabled" ? "Permission needed" : auth.state === "reauth_required" ? "Connection expired" : auth.state === "checking" ? "Checking connection…" : "Not connected";
  $("#accountStatusDetail").textContent = auth.detail || "Connect before asking the tutor.";
  $("#accountStatePill").textContent = connected ? "Connected" : auth.state === "connecting" ? "Waiting" : auth.state === "checking" ? "Checking" : auth.state === "disconnecting" ? "Signing out" : "Not connected";
  $("#accountStatusCard").className = `account-status-card ${connected ? "connected" : auth.state || "disconnected"}`;
  $("#accountPrimaryButton").textContent = connected ? "Done" : "Continue with ChatGPT";
  $("#accountPrimaryButton").disabled = busy;
  $("#accountPrimaryButton").dataset.action = connected ? "done" : "sign-in";
  $("#signOutButton").classList.toggle("visible", connected);
  $("#signOutButton").disabled = busy;
  $("#manageUsageButton").classList.toggle("visible", connected);
  $("#manageUsageButton").disabled = busy;
  $("#cancelSignInButton").classList.toggle("visible", auth.state === "connecting");
  $("#refreshAccountButton").classList.toggle("hidden", busy);
}

function openAccountDialog() {
  renderAccountDialog();
  if (!els.accountDialog.open) els.accountDialog.showModal();
}

function updateVoiceUI() {
  if (!state) return;
  let label = "Voice ready";
  let style = "";
  if (state.settings.muted) { label = "Voice muted"; style = "muted"; }
  else if (state.voiceState === "error") { label = "Voice unavailable"; style = "error"; }
  else if (state.voiceState === "speaking") { label = "Speaking"; style = "busy"; }
  else if (state.voiceState === "loading") { label = "Preparing voice"; style = "busy"; }
  else if (state.voiceState === "downloading_voice") { label = "Loading local voice"; style = "busy"; }
  else if (state.asrState === "downloading_speech_model") { label = "Loading local hearing"; style = "busy"; }
  else if (state.asrState === "transcribing") { label = "Transcribing"; style = "busy"; }
  else if (recording) { label = state.settings.handsFree ? "Hands-free listening" : "Listening"; style = "listening"; }
  else if (state.tutorState === "thinking") { label = "Thinking"; style = "busy"; }
  else if (state.settings.handsFree && state.activeSession) label = "Hands-free ready";
  els.voiceStatusChip.className = `voice-status-chip ${style}`;
  els.voiceStatusChip.querySelector("span").textContent = label;
  if (state.settings.muted) els.voiceCaption.textContent = "Spoken replies are muted";
  else if (state.voiceState === "speaking") els.voiceCaption.textContent = "Speaking — click Stop in the assistant panel to interrupt";
  else if (state.voiceState === "loading") els.voiceCaption.textContent = "Preparing voice locally…";
  else if (state.voiceState === "downloading_voice") els.voiceCaption.textContent = "Loading the local voice model for the first reply…";
  else if (state.asrState === "downloading_speech_model") els.voiceCaption.textContent = "Loading local speech recognition for the first question…";
  else if (state.asrState === "transcribing") els.voiceCaption.textContent = "Transcribing locally…";
  else if (recording) els.voiceCaption.textContent = state.settings.handsFree ? "Listening hands-free — just ask your question" : "Listening — click again to send";
  else if (state.settings.handsFree && state.activeSession) els.voiceCaption.textContent = "Hands-free is on — listening resumes after every reply";
  else els.voiceCaption.textContent = "Click the microphone to ask; replies are spoken by default";
}

function updateReceiver(receiver) {
  if (!receiver) return;
  const connected = receiver.connected;
  els.connectionBadge.className = `connection-badge ${connected ? "live" : "offline"}`;
  els.connectionBadge.querySelector("span").textContent = connected ? "iPad live" : "Waiting for iPad";
  const address = receiver.addresses?.[0];
  els.pairingAddress.textContent = address ? `${address}:${receiver.port}` : `This Mac:${receiver.port}`;
  els.pairingToken.textContent = receiver.token;
}

function renderFrame(frame) {
  if (!frame) {
    els.screenImage.style.display = "none";
    els.emptyCapture.style.display = "block";
    els.frameMeta.textContent = "";
    els.annotationLayer.innerHTML = "";
    return;
  }
  els.emptyCapture.style.display = "none";
  els.screenImage.style.display = "block";
  if (els.screenImage.src !== frame.dataUrl) els.screenImage.src = frame.dataUrl;
  const age = Math.max(0, Math.round((Date.now() - frame.receivedAt) / 1000));
  els.frameMeta.textContent = `${frame.source} · ${age < 2 ? "now" : `${age}s ago`}`;
  requestAnimationFrame(positionAnnotations);
}

function latestAnnotations() {
  const last = [...(state?.messages || [])].reverse().find((message) => message.role === "assistant" && message.annotations?.length);
  return last?.annotations || [];
}

function positionAnnotations() {
  if (!state?.frame || !els.screenImage.complete) return;
  const imageRect = els.screenImage.getBoundingClientRect();
  const fitRect = $("#frameFit").getBoundingClientRect();
  Object.assign(els.annotationLayer.style, {
    left: `${imageRect.left - fitRect.left}px`, top: `${imageRect.top - fitRect.top}px`, width: `${imageRect.width}px`, height: `${imageRect.height}px`,
  });
  const annotations = latestAnnotations();
  const paths = annotations.filter((item) => (item.kind === "arrow" || item.kind === "ghost") && item.points?.length > 1);
  const svg = paths.length ? `<svg class="overlay-svg" viewBox="0 0 1000 1000" preserveAspectRatio="none" aria-hidden="true"><defs><marker id="guide-arrow" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M 0 0 L 10 5 L 0 10 z" fill="#ef5a2f"></path></marker></defs>${paths.map((item) => `<polyline class="overlay-path ${item.kind}" points="${item.points.map((point) => `${point.x * 1000},${point.y * 1000}`).join(" ")}" ${item.kind === "arrow" ? `marker-end="url(#guide-arrow)"` : ""}></polyline>`).join("")}</svg>` : "";
  const regions = annotations.filter((item) => item.kind !== "arrow" || item.points?.length < 2).map((item, index) => {
    const kind = item.kind || "box";
    const content = kind === "step" ? `<span>${escapeHtml(item.overlayText || String(index + 1))}</span>` : kind === "ghost" ? `<span class="ghost-text">${escapeHtml(item.overlayText || item.label)}</span>` : `<span>${escapeHtml(item.label)}</span>`;
    return `<div class="annotation ${item.status} ${kind}" style="left:${item.x * 100}%;top:${item.y * 100}%;width:${item.width * 100}%;height:${item.height * 100}%">${content}</div>`;
  }).join("");
  els.annotationLayer.innerHTML = svg + regions;
}

function renderMessages() {
  const messages = state.messages || [];
  if (!messages.length) {
    els.conversation.innerHTML = `
      <div class="welcome-card"><span class="index">01</span><p>I’ll look at the page you’re working on and guide you from the first uncertain step. I’ll hint before I solve.</p>
      <div class="prompt-chips"><button data-prompt="Check my work and point out the first mistake.">Check my work</button><button data-prompt="Give me one hint for the next step.">Give me a hint</button><button data-prompt="Explain what this problem is asking.">Explain the problem</button></div></div>`;
  } else {
    els.conversation.innerHTML = messages.map((message) => `
      <article class="message ${message.role}">
        <div class="message-meta">${message.role === "user" ? "You" : "Study Companion"}${message.source ? ` · ${escapeHtml(message.source)}` : ""}</div>
        <div class="message-body">${richText(message.content)}</div>
        ${message.mode ? `<span class="mode-tag">${escapeHtml(message.mode)}</span>` : ""}
      </article>`).join("") + (state.tutorState === "thinking" ? `<div class="thinking-message"><i></i><span>Reading the page and checking each step…</span></div>` : "");
    els.conversation.scrollTop = els.conversation.scrollHeight;
  }
  $$('[data-prompt]').forEach((button) => button.addEventListener("click", () => {
    els.questionInput.value = button.dataset.prompt;
    sendQuestion();
  }));
}

function updateTutorState(value) {
  const labels = { thinking: "Reading your work…", idle: state?.activeSession ? "Ready for a question" : "Start a study session" };
  els.tutorStatus.textContent = labels[value] || "Ready when you are";
  els.tutorOrb.classList.toggle("working", value === "thinking");
  els.sendButton.disabled = !state?.activeSession || value === "thinking";
  updateVoiceUI();
}

function openCourseDialog(course = null) {
  editingCourseId = course?.id || null;
  $("#courseDialogEyebrow").textContent = course ? "Course settings" : "New course";
  $("#courseDialogTitle").textContent = course ? "Keep this course organized." : "Give this context a home.";
  $("#saveCourseButton").textContent = course ? "Save changes" : "Create course";
  $("#deleteCourseButton").classList.toggle("visible", Boolean(course));
  $("#courseName").value = course?.name || "";
  $("#courseShortName").value = course?.shortName || "";
  selectedColor = course?.color || "#168aad";
  $$('.color-dot').forEach((dot) => dot.classList.toggle("selected", dot.dataset.color === selectedColor));
  els.courseDialog.showModal();
  $("#courseName").focus();
}

function confirmAction(title, body, button = "Delete") {
  $("#confirmTitle").textContent = title;
  $("#confirmBody").textContent = body;
  $("#confirmButton").textContent = button;
  els.confirmDialog.returnValue = "cancel";
  els.confirmDialog.showModal();
  return new Promise((resolve) => els.confirmDialog.addEventListener("close", () => resolve(els.confirmDialog.returnValue === "confirm"), { once: true }));
}

function renderLibrary() {
  const course = activeCourse();
  if (!course) { els.libraryDialog.close(); return; }
  els.libraryTitle.textContent = course.name;
  $("#materialCountLabel").textContent = `${course.materialCount} local file${course.materialCount === 1 ? "" : "s"}`;
  els.librarySummary.innerHTML = `
    <div class="summary-tile"><span>Materials</span><strong>${course.materialCount}</strong></div>
    <div class="summary-tile"><span>Review due</span><strong>${course.reviewDueCount}</strong></div>
    <div class="summary-tile"><span>Last updated</span><strong>${escapeHtml(formatDate(course.updatedAt))}</strong></div>`;
  els.materialList.innerHTML = course.materials.length ? course.materials.map((material) => `
    <div class="material-row" data-material-row="${material.id}">
      <div class="material-name"><strong title="${escapeHtml(material.name)}">${escapeHtml(material.name)}</strong><span>${escapeHtml(material.kind.toUpperCase())} · added ${escapeHtml(formatDate(material.addedAt))}</span></div>
      <select data-material-category="${material.id}" aria-label="Material type">
        ${["syllabus", "assignment", "slides", "rubric", "notes"].map((category) => `<option value="${category}" ${material.category === category ? "selected" : ""}>${category[0].toUpperCase() + category.slice(1)}</option>`).join("")}
      </select>
      <input data-material-date="${material.id}" type="date" value="${dateInputValue(material.sourceDate)}" aria-label="Material date" />
      <button class="remove-material" data-remove-material="${material.id}" aria-label="Remove ${escapeHtml(material.name)}">×</button>
    </div>`).join("") : `<div class="library-empty">Add a syllabus, rubric, assignment, slides, or notes. The tutor will automatically use the most relevant and current material.</div>`;

  const events = course.upcomingEvents || [];
  const reviews = course.dueReviews || [];
  els.coursePulse.innerHTML = `
    <div class="pulse-block"><span>Upcoming from syllabus</span>${events.length ? events.map((event) => `<p class="pulse-item"><strong>${escapeHtml(event.dateText)}</strong>${escapeHtml(event.title)}</p>`).join("") : `<p class="pulse-item">Add a syllabus to surface exams, assignments, and deadlines here.</p>`}</div>
    <div class="pulse-block"><span>Spaced review</span>${reviews.length ? reviews.map((review) => `<p class="pulse-item"><strong>${escapeHtml(review.concept)}</strong>${escapeHtml(review.prompt)}</p>`).join("") : `<p class="pulse-item">No review is due yet. Turn on Course memory to build a private review queue as you study.</p>`}${reviews.length ? `<button class="button quiet review-button" id="reviewDueButton">Review what’s due</button>` : ""}</div>`;

  $$('[data-material-category]').forEach((select) => select.addEventListener("change", () => updateMaterial(select.dataset.materialCategory, { category: select.value })));
  $$('[data-material-date]').forEach((input) => input.addEventListener("change", () => updateMaterial(input.dataset.materialDate, { sourceDate: input.value })));
  $$('[data-remove-material]').forEach((button) => button.addEventListener("click", async () => {
    const material = course.materials.find((item) => item.id === button.dataset.removeMaterial);
    if (!await confirmAction("Remove this material?", `${material?.name || "This file"} will no longer be available to the tutor. The original file is not changed.`, "Remove")) return;
    try { state = await window.study.removeMaterial(course.id, button.dataset.removeMaterial); render(); renderLibrary(); } catch (error) { showToast(error); }
  }));
  $("#reviewDueButton")?.addEventListener("click", () => beginDueReview(reviews));
}

async function updateMaterial(materialId, patch) {
  const course = activeCourse();
  try { state = await window.study.updateMaterial(course.id, materialId, patch); render(); renderLibrary(); } catch (error) { showToast(error); }
}

async function beginDueReview(reviews) {
  els.libraryDialog.close();
  try {
    if (!state.activeSession) state = await window.study.startSession();
    render();
    els.questionInput.value = `Quiz me on these due review items one at a time without showing the answers first:\n${reviews.map((item) => `- ${item.concept}: ${item.prompt}`).join("\n")}`;
    resizeInput();
    await sendQuestion();
  } catch (error) { showToast(error); }
}

async function sendQuestion() {
  if (!state?.activeSession || state.tutorState === "thinking") {
    if (!state?.activeSession) showToast("Start a study session first.");
    return;
  }
  if (!state.chatgpt.authenticated) {
    openAccountDialog();
    showToast("Connect your ChatGPT account before asking the tutor.");
    return;
  }
  const question = els.questionInput.value.trim();
  els.questionInput.value = "";
  resizeInput();
  try {
    await window.study.askTutor(question);
  } catch (error) {
    showToast(error);
  }
}

function resizeInput() {
  els.questionInput.style.height = "auto";
  els.questionInput.style.height = `${Math.min(90, els.questionInput.scrollHeight)}px`;
}

async function startRecording() {
  if (recording || !state?.activeSession || state?.tutorState === "thinking" || state?.voiceState === "speaking" || state?.voiceState === "loading" || state?.asrState === "transcribing") return;
  if (!state.chatgpt.authenticated) {
    openAccountDialog();
    showToast("Connect ChatGPT before asking by voice.");
    return;
  }
  try {
    mediaStream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true } });
    audioContext = new AudioContext();
    const source = audioContext.createMediaStreamSource(mediaStream);
    processor = audioContext.createScriptProcessor(4096, 1, 1);
    audioChunks = [];
    audioStartedAt = Date.now();
    heardSpeech = false;
    silenceStartedAt = 0;
    processor.onaudioprocess = (event) => {
      if (!recording) return;
      const values = new Float32Array(event.inputBuffer.getChannelData(0));
      audioChunks.push(values);
      const rms = Math.sqrt(values.reduce((sum, value) => sum + value * value, 0) / values.length);
      if (rms > 0.018) { heardSpeech = true; silenceStartedAt = 0; }
      else if (heardSpeech && !silenceStartedAt) silenceStartedAt = Date.now();
      if (state?.settings.handsFree && silenceStartedAt && Date.now() - silenceStartedAt > 1100 && Date.now() - audioStartedAt > 800) stopRecording(true);
      else if (!heardSpeech && Date.now() - audioStartedAt > 30_000) { audioChunks = []; audioStartedAt = Date.now(); }
      else if (heardSpeech && Date.now() - audioStartedAt > 45_000) {
        const shouldSend = Boolean(state?.settings.handsFree);
        stopRecording(shouldSend);
        if (!shouldSend) showToast("Recording stopped after 45 seconds. Tap the microphone again when you're ready to ask.");
      }
    };
    source.connect(processor);
    processor.connect(audioContext.destination);
    recording = true;
    els.micButton.classList.add("recording");
    updateVoiceUI();
  } catch (error) { showToast(error); }
}

async function stopRecording(transcribe = true) {
  if (!recording) return;
  recording = false;
  els.micButton.classList.remove("recording");
  const capturedChunks = audioChunks;
  audioChunks = [];
  processor?.disconnect();
  mediaStream?.getTracks().forEach((track) => track.stop());
  const sourceRate = audioContext?.sampleRate || 48000;
  await audioContext?.close();
  processor = null; mediaStream = null; audioContext = null;
  if (!transcribe || !capturedChunks.length || !heardSpeech) { updateVoiceUI(); if (state?.settings.handsFree && state?.activeSession) setTimeout(startRecording, 700); return; }
  try {
    state.asrState = "transcribing";
    els.voiceCaption.textContent = "Transcribing locally…";
    updateVoiceUI();
    const wav = encodeWav(resample(flatten(capturedChunks), sourceRate, 16000), 16000);
    const text = (await window.study.transcribe(new Uint8Array(wav))).trim();
    state.asrState = "idle";
    els.questionInput.value = text;
    resizeInput();
    els.voiceCaption.textContent = text ? "Question captured" : "I didn’t catch that — try again";
    if (text) await sendQuestion();
    else if (state.settings.handsFree) setTimeout(startRecording, 700);
  } catch (error) { state.asrState = "idle"; showToast(error); els.voiceCaption.textContent = "Voice failed — you can still type"; updateVoiceUI(); }
}

function flatten(chunks) {
  const output = new Float32Array(chunks.reduce((sum, chunk) => sum + chunk.length, 0));
  let offset = 0;
  for (const chunk of chunks) { output.set(chunk, offset); offset += chunk.length; }
  return output;
}

function resample(input, fromRate, toRate) {
  if (fromRate === toRate) return input;
  const ratio = fromRate / toRate;
  const output = new Float32Array(Math.round(input.length / ratio));
  for (let index = 0; index < output.length; index++) {
    const start = Math.floor(index * ratio);
    const end = Math.min(input.length, Math.floor((index + 1) * ratio));
    let sum = 0;
    for (let cursor = start; cursor < end; cursor++) sum += input[cursor];
    output[index] = sum / Math.max(1, end - start);
  }
  return output;
}

function encodeWav(samples, sampleRate) {
  const buffer = new ArrayBuffer(44 + samples.length * 2);
  const view = new DataView(buffer);
  const write = (offset, text) => [...text].forEach((char, i) => view.setUint8(offset + i, char.charCodeAt(0)));
  write(0, "RIFF"); view.setUint32(4, 36 + samples.length * 2, true); write(8, "WAVE"); write(12, "fmt ");
  view.setUint32(16, 16, true); view.setUint16(20, 1, true); view.setUint16(22, 1, true); view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true); view.setUint16(32, 2, true); view.setUint16(34, 16, true); write(36, "data"); view.setUint32(40, samples.length * 2, true);
  samples.forEach((sample, index) => view.setInt16(44 + index * 2, Math.max(-1, Math.min(1, sample)) * (sample < 0 ? 0x8000 : 0x7fff), true));
  return buffer;
}

$("#newCourseButton").addEventListener("click", () => openCourseDialog());
els.accountButton.addEventListener("click", openAccountDialog);
$("#closeAccountButton").addEventListener("click", () => els.accountDialog.close());
$("#accountPrimaryButton").addEventListener("click", async () => {
  if ($("#accountPrimaryButton").dataset.action === "done") { els.accountDialog.close(); return; }
  try {
    await window.study.signIn();
  } catch (error) {
    showToast(error);
    try { state = await window.study.refreshAuth(); render(); } catch { /* Keep the last visible state. */ }
  }
});
$("#refreshAccountButton").addEventListener("click", async () => {
  try { state = await window.study.refreshAuth(); render(); } catch (error) { showToast(error); }
});
$("#manageUsageButton").addEventListener("click", () => window.study.manageUsage().catch(showToast));
$("#cancelSignInButton").addEventListener("click", () => window.study.cancelSignIn());
$("#signOutButton").addEventListener("click", async () => {
  els.accountDialog.close();
  const accepted = await confirmAction("Sign out of Study Companion?", "This removes Study Companion's encrypted ChatGPT connection from this Mac. It does not sign you out of chatgpt.com, affect Codex, or erase course data.", "Sign out");
  if (!accepted) { openAccountDialog(); return; }
  try { state = await window.study.signOut(); render(); openAccountDialog(); } catch (error) { showToast(error); openAccountDialog(); }
});
$("#closeCourseButton").addEventListener("click", () => els.courseDialog.close());
$("#courseForm").addEventListener("submit", async (event) => {
  event.preventDefault();
  const name = $("#courseName").value.trim();
  if (!name) return;
  try {
    const input = { name, shortName: $("#courseShortName").value, color: selectedColor };
    state = editingCourseId ? await window.study.updateCourse(editingCourseId, input) : await window.study.createCourse(input);
    els.courseDialog.close(); event.target.reset(); render();
  } catch (error) { showToast(error); }
});
$("#deleteCourseButton").addEventListener("click", async () => {
  const course = state.courses.find((item) => item.id === editingCourseId);
  if (!course) return;
  els.courseDialog.close();
  const accepted = await confirmAction(`Delete ${course.name}?`, "Its copied course context, messages, and review queue will be removed. Session screenshots are moved into the local recovery archive.");
  if (!accepted) { openCourseDialog(course); return; }
  try { state = await window.study.deleteCourse(course.id); editingCourseId = null; render(); } catch (error) { showToast(error); }
});
$$('.color-dot').forEach((button) => button.addEventListener("click", () => {
  selectedColor = button.dataset.color;
  $$('.color-dot').forEach((dot) => dot.classList.toggle("selected", dot === button));
}));
els.sessionButton.addEventListener("click", async () => {
  try {
    const ending = Boolean(state.activeSession);
    state = await (ending ? window.study.endSession() : window.study.startSession());
    render();
    if (!ending && state.settings.handsFree) startRecording();
    if (ending && recording) stopRecording(false);
  } catch (error) { showToast(error); }
});
els.materialsButton.addEventListener("click", () => { if (!activeCourse()) return; renderLibrary(); els.libraryDialog.showModal(); });
$("#closeLibraryButton").addEventListener("click", () => els.libraryDialog.close());
$("#editCourseButton").addEventListener("click", () => { const course = activeCourse(); els.libraryDialog.close(); openCourseDialog(course); });
$("#addFilesButton").addEventListener("click", async () => { try { state = await window.study.addMaterial(); render(); renderLibrary(); } catch (error) { showToast(error); } });
$("#captureMacButton").addEventListener("click", () => window.study.captureMac().catch(showToast));
$("#emptyMacButton").addEventListener("click", () => window.study.captureMac().catch(showToast));
els.sendButton.addEventListener("click", sendQuestion);
els.questionInput.addEventListener("input", resizeInput);
els.questionInput.addEventListener("keydown", (event) => { if (event.key === "Enter" && !event.shiftKey) { event.preventDefault(); sendQuestion(); } });
els.micButton.addEventListener("click", () => recording ? stopRecording(true) : startRecording());
els.muteButton.addEventListener("click", async () => { state = await window.study.updateSettings({ muted: !state.settings.muted }); render(); });
els.guidanceButton.addEventListener("click", async () => { state = await window.study.updateSettings({ showGuidance: !state.settings.showGuidance }); render(); });
els.memoryToggle.addEventListener("change", async () => { state = await window.study.updateSettings({ persistCourseMemory: els.memoryToggle.checked }); render(); });
els.handsFreeToggle.addEventListener("change", async () => {
  state = await window.study.updateSettings({ handsFree: els.handsFreeToggle.checked }); render();
  if (state.settings.handsFree && state.activeSession) startRecording(); else if (recording) stopRecording(false);
});
$("#stopVoiceButton").addEventListener("click", () => window.study.stopVoice());
els.screenImage.addEventListener("load", positionAnnotations);
window.addEventListener("resize", positionAnnotations);

window.study.onState((value) => { state = value; render(); });
window.study.onFrame((frame) => { state.frame = frame; renderFrame(frame); });
window.study.onReceiver((receiver) => { state.receiver = receiver; updateReceiver(receiver); });
window.study.onTutorState((value) => { state.tutorState = value; updateTutorState(value); renderMessages(); if (value === "thinking" && recording) stopRecording(false); });
window.study.onVoiceState((value) => {
  state.voiceState = value;
  if (value === "speaking" && recording) stopRecording(false);
  updateVoiceUI();
  if (value === "idle" && state.settings.handsFree && state.activeSession && state.tutorState !== "thinking") setTimeout(startRecording, 500);
});
window.study.onVoiceError((value) => { state.voiceState = "error"; updateVoiceUI(); showToast(`Voice could not play: ${value}`); });
window.study.onAsrState((value) => { state.asrState = value; updateVoiceUI(); });

window.study.getState().then((value) => { state = value; render(); }).catch(showToast);
