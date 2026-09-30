const path = require("path");
const { app, BrowserWindow, ipcMain, dialog, desktopCapturer, session, safeStorage, shell } = require("electron");
const { StudyStore } = require("./src/store");
const { FrameServer } = require("./src/frame-server");
const { ChatGPTTutor } = require("./src/chatgpt-tutor");
const { createCredentialEncryption } = require("./src/credential-encryption");
const { VoiceService } = require("./src/voice-service");
const { AsrService } = require("./src/asr-service");
const { readMaterial } = require("./src/materials");

let window;
let store;
let frameServer;
let tutor;
let voice;
let asr;
let chatgptUsageUrl = "https://chatgpt.com/settings/usage";
let tutorState = "idle";
let voiceState = "idle";
let asrState = "idle";

function send(channel, value) {
  if (window && !window.isDestroyed()) window.webContents.send(channel, value);
}

function framePayload(frame = frameServer?.lastFrame) {
  if (!frame) return null;
  return {
    dataUrl: `data:${frame.mime};base64,${frame.buffer.toString("base64")}`,
    mime: frame.mime,
    width: frame.width,
    height: frame.height,
    source: frame.source,
    receivedAt: frame.receivedAt,
  };
}

function currentState() {
  return store.publicState({
    frame: framePayload(),
    receiver: frameServer.info(),
    chatgpt: tutor.status(),
    tutorState,
    voiceState,
    asrState,
  });
}

function broadcastState() {
  send("app:state", currentState());
}

function registerIpc() {
  ipcMain.handle("app:get-state", () => currentState());

  ipcMain.handle("auth:refresh", async () => {
    await tutor.refreshAuth();
    broadcastState();
    return currentState();
  });

  ipcMain.handle("auth:sign-in", async () => {
    try {
      await tutor.signIn(() => broadcastState());
      return currentState();
    } finally {
      broadcastState();
    }
  });

  ipcMain.handle("auth:cancel-sign-in", () => {
    tutor.cancelSignIn();
  });

  ipcMain.handle("auth:sign-out", async () => {
    tutor.cancel();
    voice.stop();
    tutorState = "idle";
    try {
      await tutor.signOut(() => broadcastState());
      return currentState();
    } finally {
      broadcastState();
    }
  });

  ipcMain.handle("auth:manage-usage", () => shell.openExternal(chatgptUsageUrl));

  ipcMain.handle("course:create", (_event, input) => {
    store.createCourse(input || {});
    broadcastState();
    return currentState();
  });

  ipcMain.handle("course:select", (_event, courseId) => {
    store.selectCourse(courseId);
    broadcastState();
    return currentState();
  });

  ipcMain.handle("course:update", (_event, courseId, patch) => {
    store.updateCourse(courseId, patch || {});
    broadcastState();
    return currentState();
  });

  ipcMain.handle("course:delete", (_event, courseId) => {
    store.deleteCourse(courseId);
    broadcastState();
    return currentState();
  });

  ipcMain.handle("session:start", () => {
    store.startSession();
    broadcastState();
    return currentState();
  });

  ipcMain.handle("session:end", () => {
    tutor.cancel();
    voice.stop();
    store.endSession();
    tutorState = "idle";
    broadcastState();
    return currentState();
  });

  ipcMain.handle("settings:update", (_event, patch) => {
    store.updateSettings(patch || {});
    if (store.data.settings.muted) voice.stop();
    broadcastState();
    return currentState();
  });

  ipcMain.handle("material:add", async () => {
    const course = store.selectedCourse();
    if (!course) throw new Error("Create a course first.");
    const result = await dialog.showOpenDialog(window, {
      title: `Add material to ${course.name}`,
      properties: ["openFile", "multiSelections"],
      filters: [
        { name: "Course material", extensions: ["pdf", "pptx", "txt", "md", "markdown", "csv", "doc", "docx", "rtf"] },
      ],
    });
    if (result.canceled) return currentState();
    for (const file of result.filePaths) store.addMaterial(course.id, await readMaterial(file));
    broadcastState();
    return currentState();
  });

  ipcMain.handle("material:update", (_event, courseId, materialId, patch) => {
    store.updateMaterial(courseId, materialId, patch || {});
    broadcastState();
    return currentState();
  });

  ipcMain.handle("material:remove", (_event, courseId, materialId) => {
    store.removeMaterial(courseId, materialId);
    broadcastState();
    return currentState();
  });

  ipcMain.handle("frame:capture-mac", async () => {
    const sources = await desktopCapturer.getSources({
      types: ["screen"],
      thumbnailSize: { width: 1800, height: 1200 },
      fetchWindowIcons: false,
    });
    const source = sources[0];
    if (!source || source.thumbnail.isEmpty()) throw new Error("macOS did not return a screen image. Check Screen Recording permission.");
    const size = source.thumbnail.getSize();
    frameServer.setFrame(source.thumbnail.toJPEG(88), {
      mime: "image/jpeg",
      width: size.width,
      height: size.height,
      source: "Mac screen",
    });
    return framePayload();
  });

  ipcMain.handle("tutor:ask", async (_event, rawQuestion) => {
    const sessionRow = store.activeSession();
    if (!sessionRow) throw new Error("Start a study session first.");
    const question = String(rawQuestion || "").trim() || "What should I notice on this screen? Give me a hint, not the final answer.";
    const course = store.selectedCourse();
    const previousMessages = store.messagesFor(sessionRow.id);
    const frame = frameServer.lastFrame;
    let imagePath = null;
    if (frame) {
      const extension = frame.mime === "image/png" ? "png" : frame.mime === "image/webp" ? "webp" : "jpg";
      imagePath = store.saveSnapshot(frame.buffer, extension);
    }
    store.addMessage({ role: "user", content: question, imagePath, source: frame?.source || null });
    tutorState = "thinking";
    broadcastState();

    try {
      const result = await tutor.ask({
        course,
        question,
        messages: previousMessages,
        imagePath,
        onStatus: (value) => {
          tutorState = value;
          send("tutor:state", value);
        },
      });
      store.addMessage({
        role: "assistant",
        content: result.answer,
        spoken: result.spoken,
        mode: result.mode,
        summary: result.summary,
        review: result.review,
        annotations: result.annotations,
        imagePath,
      });
      tutorState = "idle";
      broadcastState();
      if (!store.data.settings.muted) voice.speak(result.spoken).catch((error) => send("voice:error", error.message));
      return result;
    } catch (error) {
      tutorState = "idle";
      broadcastState();
      throw error;
    }
  });

  ipcMain.handle("tutor:cancel", () => {
    tutor.cancel();
    tutorState = "idle";
    broadcastState();
  });

  ipcMain.handle("voice:stop", () => voice.stop());
  ipcMain.handle("voice:transcribe", async (_event, bytes) => {
    try {
      return await asr.transcribe(Buffer.from(bytes));
    } finally {
      asrState = "idle";
      send("asr:state", asrState);
    }
  });
}

async function createWindow() {
  window = new BrowserWindow({
    width: 1480,
    height: 920,
    minWidth: 1100,
    minHeight: 720,
    title: "Study Companion",
    backgroundColor: "#f3efe5",
    titleBarStyle: "hiddenInset",
    trafficLightPosition: { x: 18, y: 18 },
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });
  await window.loadFile(path.join(__dirname, "renderer", "index.html"));
}

app.whenReady().then(async () => {
  const userData = app.getPath("userData");
  const { createChatGPT, CHATGPT_USAGE_URL } = await import("@siwc/local");
  chatgptUsageUrl = CHATGPT_USAGE_URL;
  store = new StudyStore(userData);
  const chatgpt = createChatGPT({
    appName: "Study Companion",
    appId: "study-companion",
    redirectPort: 0,
    storageDir: path.join(userData, "chatgpt"),
    credentialEncryption: createCredentialEncryption(safeStorage),
    openBrowser: (url) => shell.openExternal(url),
    sendHostId: true,
  });
  tutor = new ChatGPTTutor({
    client: chatgpt,
    schemaPath: path.join(__dirname, "schemas", "tutor-response.schema.json"),
  });
  tutor.setAuthListener(() => broadcastState());
  voice = new VoiceService({
    cacheDir: path.join(userData, "voice-cache"),
    onState: (value) => {
      voiceState = value;
      send("voice:state", value);
    },
  });
  asr = new AsrService({
    cacheDir: path.join(userData, "audio-cache"),
    onState: (value) => {
      asrState = value;
      send("asr:state", value);
    },
  });
  frameServer = new FrameServer({
    token: store.data.settings.pairingToken,
    onFrame: (frame) => {
      send("frame:update", framePayload(frame));
      send("receiver:update", frameServer.info());
    },
  });
  await frameServer.start();

  session.defaultSession.setPermissionRequestHandler((_webContents, permission, callback) => {
    callback(permission === "media");
  });
  registerIpc();
  await createWindow();
  void tutor.refreshAuth().then(broadcastState);

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});

app.on("before-quit", () => {
  tutor?.dispose();
  voice?.dispose();
  asr?.dispose();
  frameServer?.stop();
});
