let currentView = "overview";
let selectedLecture = null;
let lectureRecorder = null;
let recordingLectureId = null;
let lectureTimer = null;
let lectureRequest = 0;
let lectureSearchResults = null;
let lectureSearchRequest = 0;
let lastLectureCourseId = null;
let lectureTab = "notes";
let setupBusy = false;
let finishingLecture = false;
let editingNoteId = null;
window.lectureRecorderActive = false;

function clockTime(value) {
  const seconds = Math.max(0, Math.floor(value || 0));
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
}

function setView(view) {
  currentView = view;
  for (const name of ["overview", "live", "lectures"]) $(`#${name}View`).hidden = name !== view;
  $$('[data-view]').forEach((button) => {
    if (button.dataset.view === view) button.setAttribute("aria-current", "page");
    else button.removeAttribute("aria-current");
  });
  els.sessionButton.hidden = view !== "live";
  if (view === "live") requestAnimationFrame(positionAnnotations);
  if (view === "lectures") renderLectureIndex();
}

function renderOverview() {
  const course = activeCourse();
  const lectures = state?.lectures || [];
  const events = course?.upcomingEvents || [];
  const reviews = course?.dueReviews || [];
  $("#overviewContent").innerHTML = `<div class="overview-content">
    <div class="overview-intro"><div><span class="eyebrow">Your study desk</span><h1>${escapeHtml(course?.name || "Make room for learning.")}</h1><p>${course ? "From the first lecture to the last review. Everything for this course, together." : "Create a course to organize your lectures, notes, and study materials."}</p></div><span class="overview-course-tag">${escapeHtml(course?.shortName || "Start here")}</span></div>
    ${course ? `<div class="study-actions">
      <button class="study-action featured" id="overviewRecord"><span class="action-icon" aria-hidden="true">♫</span><div><strong>Be present in class.</strong><p>Record a lecture and capture your thoughts. Turn it into something you can study later.</p></div><span class="action-link">Record a lecture →</span></button>
      <button class="study-action" id="overviewTutor"><span class="action-icon" aria-hidden="true">↗</span><div><strong>Work through the next step.</strong><p>Ask about your course or share your screen for a hint, explanation, or work check.</p></div><span class="action-link">Open the live tutor →</span></button>
    </div><div class="overview-grid"><section><div class="overview-section-heading"><h2>Recent lectures</h2><button id="overviewAllLectures">View all ${lectures.length ? `(${lectures.length})` : ""} →</button></div>
      ${lectures.length ? lectures.slice(0, 4).map((lecture) => `<button class="recent-lecture" data-recent-lecture="${lecture.id}"><span aria-hidden="true">≋</span><div><strong>${escapeHtml(lecture.title)}</strong><small>${formatDate(lecture.createdAt)} · ${clockTime(lecture.duration)} · ${lecture.noteCount} note${lecture.noteCount === 1 ? "" : "s"}</small></div><small>→</small></button>`).join("") : `<div class="overview-empty">Your next lecture starts here. Record audio and add notes as you listen.<button id="overviewFirstLecture">Start your first recording →</button></div>`}
    </section><section><div class="overview-section-heading"><h2>Keep in view</h2><button id="overviewMaterials">${course.materialCount ? `${course.materialCount} materials` : "Add materials"} →</button></div>
      ${reviews.length ? `<div class="overview-event"><span>Ready to revisit</span><strong>${reviews.length} concept${reviews.length === 1 ? "" : "s"} due for review</strong><p>${escapeHtml(reviews.slice(0, 2).map((review) => review.concept).join(" · "))}</p><button class="button quiet" id="overviewReview">Practice recall →</button></div>` : ""}
      ${events.length ? events.slice(0, 3).map((event) => `<div class="overview-event"><span>${escapeHtml(event.dateText)}</span><strong>${escapeHtml(event.title)}</strong></div>`).join("") : `<div class="overview-empty">Add your syllabus to see upcoming assignments and exams here.<button id="overviewAddFiles">＋ Add course materials</button></div>`}
    </section></div>
    ${!state.chatgpt.authenticated ? `<div class="overview-account-hint"><p><strong>Ready when you need a tutor.</strong><br>Connect ChatGPT for guided help and study guides. Recording and notes work right away.</p><button class="button quiet" id="overviewConnect">Connect ChatGPT</button></div>` : ""}` : `<button class="button primary" id="overviewCreateCourse">＋ Create a course</button>`}
    </div>`;
  $("#overviewRecord")?.addEventListener("click", openLectureSetup);
  $("#overviewFirstLecture")?.addEventListener("click", openLectureSetup);
  $("#overviewTutor")?.addEventListener("click", () => { setView("live"); els.questionInput.focus(); });
  $("#overviewAllLectures")?.addEventListener("click", () => setView("lectures"));
  $("#overviewMaterials")?.addEventListener("click", () => { renderLibrary(); els.libraryDialog.showModal(); });
  $("#overviewAddFiles")?.addEventListener("click", () => window.study.addMaterial().then((value) => { state = value; render(); }).catch(showToast));
  $("#overviewConnect")?.addEventListener("click", openAccountDialog);
  $("#overviewCreateCourse")?.addEventListener("click", () => openCourseDialog());
  $("#overviewReview")?.addEventListener("click", () => { setView("live"); beginDueReview(reviews); });
  $$('[data-recent-lecture]').forEach((button) => button.addEventListener("click", () => { setView("lectures"); openLecture(button.dataset.recentLecture); }));
}

function renderLectureIndex() {
  if (!state) return;
  const course = activeCourse();
  if (lastLectureCourseId !== state.selectedCourseId) {
    lastLectureCourseId = state.selectedCourseId;
    selectedLecture = null; lectureSearchResults = null;
    $("#lectureSearch").value = "";
    $("#lectureDetail").hidden = true; $("#lectureSetup").hidden = true; $("#lectureEmpty").hidden = false;
    $("#lectureNoteInput").value = "";
  }
  $("#lectureCourseLabel").textContent = course ? `${course.name} · Saved on this Mac` : "Create a course to start recording.";
  $("#newLectureButton").disabled = !course;
  $("#emptyRecordButton").disabled = !course;
  const all = state.lectures || [];
  const lectures = lectureSearchResults === null ? all : all.filter((lecture) => lectureSearchResults.includes(lecture.id));
  $("#lectureList").innerHTML = lectures.length ? lectures.map((lecture) => `<button class="lecture-list-item" aria-current="${lecture.id === selectedLecture?.id ? "true" : "false"}" data-lecture-id="${lecture.id}"><strong>${escapeHtml(lecture.title)}</strong><span>${formatDate(lecture.createdAt)} · ${clockTime(lecture.duration)}<br>${lecture.status === "recording" ? "● Recording in progress" : lecture.status === "transcribing" ? `Transcribing · ${lecture.progress || 0}%` : lecture.status === "generating" ? "Making study guide…" : `${lecture.noteCount} note${lecture.noteCount === 1 ? "" : "s"}${lecture.hasTranscript ? " · Transcript ready" : ""}`}</span></button>`).join("") : `<p class="lecture-list-empty">${lectureSearchResults ? "No matching lectures. Try a different word from the title, notes, or transcript." : "Your lectures will appear here. Start a recording to add the first one."}</p>`;
  $$('[data-lecture-id]').forEach((button) => button.addEventListener("click", () => openLecture(button.dataset.lectureId)));
  if (selectedLecture) {
    const summary = all.find((lecture) => lecture.id === selectedLecture.id);
    if (summary) {
      selectedLecture.status = summary.status;
      selectedLecture.progress = summary.progress;
      updateLectureProcessing();
    } else if (!recordingLectureId) {
      selectedLecture = null;
      $("#lectureDetail").hidden = true; $("#lectureEmpty").hidden = false;
    }
  }
}

async function openLecture(id) {
  if (setupBusy || finishingLecture) return;
  if (window.lectureRecorderActive && id !== recordingLectureId) { showToast("Finish your recording before opening another lecture."); return; }
  if (selectedLecture?.id === id && !$("#lectureDetail").hidden) return;
  if ($("#lectureNoteInput").value.trim() && !await confirmAction("Leave this note?", "Add the note first to save it, or discard this draft to open another lecture.", "Discard draft")) return;
  const request = ++lectureRequest;
  try {
    const lecture = await window.study.getLecture(id);
    if (request !== lectureRequest || lecture.courseId !== state.selectedCourseId) return;
    selectedLecture = lecture;
    editingNoteId = null;
    $("#addLectureNoteButton").textContent = "＋ Add note";
    $("#lectureNoteInput").value = "";
    $("#lectureSetup").hidden = true; $("#lectureEmpty").hidden = true; $("#lectureDetail").hidden = false;
    renderLectureDetail(); renderLectureIndex();
  } catch (error) { showToast(error); }
}

async function openLectureSetup() {
  setView("lectures");
  if (window.lectureRecorderActive) { if (selectedLecture?.id === recordingLectureId) return; await openLecture(recordingLectureId); return; }
  if (!activeCourse()) { openCourseDialog(); return; }
  if (setupBusy) return;
  if ($("#lectureNoteInput").value.trim() && !await confirmAction("Start another lecture?", "Add your draft note first, or discard it to start a new recording.", "Discard draft")) return;
  $("#lectureNoteInput").value = ""; editingNoteId = null;
  $("#addLectureNoteButton").textContent = "＋ Add note";
  $("#noteTimestampHint").textContent = "Notes link to the current moment in the audio.";
  $("#lectureSetup").hidden = false; $("#lectureEmpty").hidden = true; $("#lectureDetail").hidden = true;
  $("#recordingCourseName").textContent = activeCourse().name;
  $("#lectureTitleInput").value = `Lecture · ${new Intl.DateTimeFormat(undefined, { month:"short", day:"numeric" }).format(new Date())}`;
  $("#lectureSetupError").hidden = true;
  $("#lectureTitleInput").focus(); $("#lectureTitleInput").select();
  try {
    const devices = (await navigator.mediaDevices.enumerateDevices()).filter((device) => device.kind === "audioinput");
    $("#lectureMicrophone").innerHTML = `<option value="">Default microphone</option>` + devices.filter((device) => device.deviceId && device.deviceId !== "default").map((device, index) => `<option value="${escapeHtml(device.deviceId)}">${escapeHtml(device.label || `Microphone ${index + 1}`)}</option>`).join("");
  } catch { /* Default microphone remains available. */ }
}

function setLectureTab(tab) {
  lectureTab = tab;
  $$('[data-lecture-tab]').forEach((button) => {
    if (button.dataset.lectureTab === tab) button.setAttribute("aria-current", "page");
    else button.removeAttribute("aria-current");
  });
  $("#lectureNotesPanel").hidden = tab !== "notes";
  $("#lectureTranscriptPanel").hidden = tab !== "transcript";
  $("#lectureGuidePanel").hidden = tab !== "guide";
}

function studyMarkdown(text) {
  // Escape first. Only a small Markdown subset is rendered; source HTML is never interpreted.
  return text.split(/\n\s*\n/).map((block) => {
    const lines = block.split("\n");
    if (lines.every((line) => /^[-*] /.test(line))) return `<ul>${lines.map((line) => `<li>${escapeHtml(line.slice(2)).replace(/\*\*(.*?)\*\*/g, "<strong>$1</strong>")}</li>`).join("")}</ul>`;
    if (lines.every((line) => /^\d+\. /.test(line))) return `<ol>${lines.map((line) => `<li>${escapeHtml(line.replace(/^\d+\. /, "")).replace(/\*\*(.*?)\*\*/g, "<strong>$1</strong>")}</li>`).join("")}</ol>`;
    return lines.map((line) => /^#{1,3} /.test(line) ? `<h3>${escapeHtml(line.replace(/^#{1,3} /, ""))}</h3>` : `<p>${escapeHtml(line).replace(/\*\*(.*?)\*\*/g, "<strong>$1</strong>")}</p>`).join("");
  }).join("");
}

function updateLectureProcessing() {
  if (!selectedLecture) return;
  const busy = ["transcribing", "generating"].includes(selectedLecture.status);
  $("#lectureProgress").hidden = !busy;
  $("#lectureProgress").textContent = selectedLecture.status === "transcribing" ? state.asrState === "downloading_speech_model" ? "Preparing local speech recognition · The speech model downloads on first use. Your audio stays on this Mac." : `Transcribing locally · ${selectedLecture.progress || 0}% · You can leave this view while it finishes.` : "Making your study guide · You can leave this view while it finishes.";
  $("#savedLectureTitle").disabled = busy;
  $("#lectureCourseSelect").disabled = busy || Boolean(recordingLectureId);
  $("#transcribeLectureButton").disabled = busy || Boolean(recordingLectureId) || !selectedLecture.duration;
  $("#generateLectureButton").disabled = busy || Boolean(recordingLectureId) || (!selectedLecture.segments.length && !selectedLecture.notes.length);
  $("#removeLectureButton").disabled = busy || Boolean(recordingLectureId);
  $("#lectureNoteInput").disabled = busy;
  $("#addLectureNoteButton").disabled = busy;
  $$('.note-actions button').forEach((button) => { button.disabled = busy; });
  $("#lectureRecordingControls").hidden = selectedLecture.id !== recordingLectureId;
  $("#exportAudioButton").disabled = Boolean(recordingLectureId);
  $("#exportNotesButton").disabled = Boolean(recordingLectureId);
}

function renderLectureDetail() {
  if (!selectedLecture) return;
  $("#savedLectureTitle").value = selectedLecture.title;
  $("#lectureMetadata").textContent = `${formatDate(selectedLecture.createdAt)} · ${clockTime(selectedLecture.duration)} · ${(selectedLecture.notes || []).length} note${selectedLecture.notes.length === 1 ? "" : "s"}`;
  $("#lectureCourseSelect").innerHTML = state.courses.map((course) => `<option value="${course.id}" ${course.id === selectedLecture.courseId ? "selected" : ""}>${escapeHtml(course.shortName || course.name)}</option>`).join("");
  const audio = $("#lectureAudio");
  $("#lectureSavedAudio").hidden = !selectedLecture.audioUrl;
  if (selectedLecture.audioUrl && audio.getAttribute("src") !== selectedLecture.audioUrl) { audio.src = selectedLecture.audioUrl; audio.load(); }
  if (!selectedLecture.audioUrl) { audio.pause(); audio.removeAttribute("src"); }
  $("#lectureError").hidden = !selectedLecture.error;
  $("#lectureError").textContent = selectedLecture.error || "";
  $("#transcribeLectureButton").textContent = selectedLecture.segments.length ? "Transcribe again" : "Transcribe locally";
  $("#generateLectureButton").textContent = selectedLecture.studyGuide ? "Regenerate guide" : "Make study guide";
  $("#lectureStudyGuide").innerHTML = selectedLecture.studyGuide ? studyMarkdown(selectedLecture.studyGuide) : `<p class="overview-empty">Add notes or transcribe your recording, then make a guide with the key ideas and questions to test your understanding.</p>`;
  $("#quizLectureButton").hidden = !selectedLecture.studyGuide;
  $("#lectureTranscriptList").innerHTML = selectedLecture.segments.length ? selectedLecture.segments.map((segment) => `<article class="transcript-row"><button class="timestamp-button" data-seek="${segment.seconds}" aria-label="Play from ${clockTime(segment.seconds)}">${clockTime(segment.seconds)}</button><p>${escapeHtml(segment.text)}</p></article>`).join("") : `<p class="overview-empty">Your transcript will appear here with links back to the recording.</p>`;
  renderLectureNotes();
  updateLectureProcessing(); setLectureTab(lectureTab); bindTimestampButtons();
}

function bindTimestampButtons() {
  $$('[data-seek]').forEach((button) => {
    button.disabled = !selectedLecture?.audioUrl;
    button.onclick = () => { const audio = $("#lectureAudio"); audio.currentTime = Number(button.dataset.seek); audio.play().catch(showToast); };
  });
}

function renderLectureNotes() {
  const notes = selectedLecture?.notes || [];
  $("#lectureNotesList").innerHTML = notes.length ? notes.map((note) => `<article class="lecture-note-row"><button class="timestamp-button" data-seek="${note.seconds}" aria-label="Play from ${clockTime(note.seconds)}">${clockTime(note.seconds)}</button><p>${escapeHtml(note.text)}</p><div class="note-actions"><button data-edit-note="${note.id}" aria-label="Edit note at ${clockTime(note.seconds)}">Edit</button><button data-remove-note="${note.id}" aria-label="Remove note at ${clockTime(note.seconds)}">×</button></div></article>`).join("") : `<p class="overview-empty">Keep the ideas that stood out. Each note links back to the moment you added it.</p>`;
  $$('[data-edit-note]').forEach((button) => button.addEventListener("click", () => {
    editingNoteId = button.dataset.editNote;
    $("#lectureNoteInput").value = notes.find((note) => note.id === editingNoteId)?.text || "";
    $("#addLectureNoteButton").textContent = "Save note";
    $("#noteTimestampHint").textContent = "Editing an existing note. Its original timestamp is kept.";
    $("#lectureNoteInput").focus();
    $("#lectureNoteForm").scrollIntoView({ block:"nearest" });
  }));
  $$('[data-remove-note]').forEach((button) => button.addEventListener("click", async () => {
    if (!await confirmAction("Remove this note?", "This removes the note. The lecture audio and transcript remain saved.", "Remove note")) return;
    try {
      selectedLecture = await window.study.updateLecture(selectedLecture.id, { notes: selectedLecture.notes.filter((note) => note.id !== button.dataset.removeNote) });
      renderLectureDetail();
    } catch (error) { showToast(error); }
  }));
  bindTimestampButtons();
}

async function saveLectureNote() {
  const text = $("#lectureNoteInput").value.trim();
  if (!text || !selectedLecture) return;
  const notes = [...selectedLecture.notes];
  if (editingNoteId) {
    const note = notes.find((item) => item.id === editingNoteId);
    if (note) note.text = text;
  } else notes.push({ id:crypto.randomUUID(), seconds: recordingLectureId ? lectureRecorder.duration : $("#lectureAudio").currentTime || 0, text });
  $("#addLectureNoteButton").disabled = true;
  try {
    selectedLecture = await window.study.updateLecture(selectedLecture.id, { notes });
    $("#lectureNoteInput").value = ""; editingNoteId = null;
    $("#addLectureNoteButton").textContent = "＋ Add note";
    $("#noteTimestampHint").textContent = "Notes link to the current moment in the audio.";
    $("#lectureSaveStatus").textContent = "Note saved on this Mac";
    renderLectureDetail();
  } finally { $("#addLectureNoteButton").disabled = false; }
}

async function finishLecture() {
  if (!recordingLectureId || finishingLecture) return;
  finishingLecture = true;
  $("#finishLectureButton").disabled = true; $("#pauseLectureButton").disabled = true;
  try {
    try { await lectureRecorder.stop(); } catch (error) { showToast(error); }
    if ($("#lectureNoteInput").value.trim()) await saveLectureNote();
    const lecture = await window.study.finishLecture(recordingLectureId);
    recordingLectureId = null; lectureRecorder = null; window.lectureRecorderActive = false;
    clearInterval(lectureTimer);
    selectedLecture = lecture;
    renderLectureDetail(); renderLectureIndex();
    $("#lectureSaveStatus").textContent = "Recording and notes saved on this Mac";
    $("#recordLectureButton").innerHTML = '<span aria-hidden="true">●</span> Record lecture';
    showToast("Lecture saved. Open Transcript to transcribe it locally when you’re ready.");
  } catch (error) { showToast(error); }
  finally { finishingLecture = false; $("#finishLectureButton").disabled = false; $("#pauseLectureButton").disabled = false; }
}

$$('[data-view]').forEach((button) => button.addEventListener("click", () => setView(button.dataset.view)));
$$('[data-lecture-tab]').forEach((button) => button.addEventListener("click", () => setLectureTab(button.dataset.lectureTab)));
$("#recordLectureButton").addEventListener("click", openLectureSetup);
$("#newLectureButton").addEventListener("click", openLectureSetup);
$("#emptyRecordButton").addEventListener("click", openLectureSetup);
$("#cancelLectureSetup").addEventListener("click", () => { $("#lectureSetup").hidden = true; if (selectedLecture) { $("#lectureDetail").hidden = false; renderLectureDetail(); } else $("#lectureEmpty").hidden = false; });
$("#lectureSetup").addEventListener("submit", async (event) => {
  event.preventDefault();
  if (setupBusy || window.lectureRecorderActive) return;
  setupBusy = true;
  const button = $("#startLectureButton"); button.disabled = true; button.textContent = "Preparing microphone…";
  $("#lectureSetupError").hidden = true;
  const recorder = new LectureRecorder();
  const courseId = activeCourse().id;
  try {
    if (recording) await stopRecording(false);
    await window.study.stopVoice();
    await recorder.prepare($("#lectureMicrophone").value);
    selectedLecture = await window.study.startLecture({ title:$("#lectureTitleInput").value, courseId });
    lectureRecorder = recorder; recordingLectureId = selectedLecture.id; window.lectureRecorderActive = true;
    recorder.begin((bytes) => window.study.appendLecture(recordingLectureId, bytes), (error) => {
      $("#lectureError").hidden = false; $("#lectureError").textContent = `${error.message} Finish & save to keep the audio already captured.`;
      $("#pauseLectureButton").disabled = true;
    });
    $("#lectureSetup").hidden = true; $("#lectureDetail").hidden = false; $("#lectureEmpty").hidden = true;
    $("#recordLectureButton").innerHTML = '<span aria-hidden="true">●</span> Recording…';
    $("#pauseLectureButton").textContent = "Pause"; $("#pauseLectureButton").disabled = false;
    lectureTab = "notes"; renderLectureDetail(); renderLectureIndex();
    lectureTimer = setInterval(() => {
      $("#lectureTimer").textContent = clockTime(recorder.duration);
      $("#lectureRecordingLabel").textContent = recorder.paused ? "Paused" : "Recording";
      $("#lectureRecordingControls").classList.toggle("paused", recorder.paused);
    }, 500);
    $("#lectureNoteInput").focus();
  } catch (error) {
    await recorder.dispose();
    $("#lectureSetupError").textContent = error.name === "NotAllowedError" ? "Microphone access is off. Allow Study Companion (or Electron in development) in System Settings → Privacy & Security → Microphone, then try again." : error.message;
    $("#lectureSetupError").hidden = false;
  } finally { setupBusy = false; button.disabled = false; button.textContent = "● Start recording"; }
});
$("#pauseLectureButton").addEventListener("click", async () => {
  if (!lectureRecorder || finishingLecture) return;
  try {
    if (lectureRecorder.paused) lectureRecorder.resume(); else await lectureRecorder.pause();
    $("#pauseLectureButton").textContent = lectureRecorder.paused ? "Resume" : "Pause";
  } catch (error) { showToast(error); }
});
$("#finishLectureButton").addEventListener("click", finishLecture);
$("#lectureNoteForm").addEventListener("submit", (event) => { event.preventDefault(); saveLectureNote().catch(showToast); });
$("#savedLectureTitle").addEventListener("change", async () => {
  if (!selectedLecture) return;
  try { selectedLecture = await window.study.updateLecture(selectedLecture.id, { title:$("#savedLectureTitle").value }); renderLectureDetail(); }
  catch (error) { showToast(error); $("#savedLectureTitle").value = selectedLecture.title; }
});
$("#lectureCourseSelect").addEventListener("change", async () => {
  if (!selectedLecture) return;
  try { await window.study.updateLecture(selectedLecture.id, { courseId:$("#lectureCourseSelect").value }); showToast("Lecture moved. Select its course to find it."); renderLectureIndex(); }
  catch (error) { showToast(error); $("#lectureCourseSelect").value = selectedLecture.courseId; }
});
$("#transcribeLectureButton").addEventListener("click", async () => {
  if (!selectedLecture) return;
  const id = selectedLecture.id;
  selectedLecture.status = "transcribing"; updateLectureProcessing();
  try { const result = await window.study.transcribeLecture(id); if (selectedLecture?.id === id) { selectedLecture = result; renderLectureDetail(); } }
  catch (error) { showToast(error); if (selectedLecture?.id === id) { selectedLecture = await window.study.getLecture(id); renderLectureDetail(); } }
});
$("#generateLectureButton").addEventListener("click", async () => {
  if (!selectedLecture) return;
  if (!state.chatgpt.authenticated) { openAccountDialog(); return; }
  const id = selectedLecture.id;
  selectedLecture.status = "generating"; updateLectureProcessing();
  try { const result = await window.study.generateLecture(id); if (selectedLecture?.id === id) { selectedLecture = result; renderLectureDetail(); } }
  catch (error) { showToast(error); if (selectedLecture?.id === id) { selectedLecture = await window.study.getLecture(id); renderLectureDetail(); } }
});
$("#quizLectureButton").addEventListener("click", () => {
  if (!selectedLecture) return;
  setView("live");
  els.questionInput.value = `Help me review the lecture “${selectedLecture.title}”. Use its study guide and transcript from my course materials. Ask one retrieval question at a time, wait for my answer, then give feedback.`;
  resizeInput(); sendQuestion();
});
$("#exportAudioButton").addEventListener("click", () => window.study.exportLecture(selectedLecture.id, "audio").then((saved) => { if (saved) showToast("Audio exported."); }).catch(showToast));
$("#exportNotesButton").addEventListener("click", () => window.study.exportLecture(selectedLecture.id, "notes").then((saved) => { if (saved) showToast("Notes exported as Markdown."); }).catch(showToast));
$("#removeLectureButton").addEventListener("click", async () => {
  if (!selectedLecture || !await confirmAction("Remove this lecture?", "The lecture will leave this course. A recovery copy of its audio and notes is kept in the local archive.", "Remove lecture")) return;
  try { state = await window.study.removeLecture(selectedLecture.id); selectedLecture = null; $("#lectureDetail").hidden = true; $("#lectureEmpty").hidden = false; render(); }
  catch (error) { showToast(error); }
});
$("#lectureSearch").addEventListener("input", async () => {
  const request = ++lectureSearchRequest;
  const query = $("#lectureSearch").value.trim();
  if (!query) { lectureSearchResults = null; renderLectureIndex(); return; }
  try { const ids = await window.study.searchLectures(query); if (request === lectureSearchRequest) { lectureSearchResults = ids; renderLectureIndex(); } }
  catch (error) { showToast(error); }
});
window.study.onLectureCloseRequest(async () => {
  setView("lectures");
  if (await confirmAction("Save your recording before closing?", "The lecture is still recording. Finish & save to keep the audio and your notes, then close the app.", "Finish & save")) await finishLecture();
});
