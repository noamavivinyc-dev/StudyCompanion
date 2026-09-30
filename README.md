# Study Companion

Study Companion is a local-first Mac and iPad study copilot. Share an iPad screen while writing in Notability (or another app), ask a question out loud, and get a spoken, hint-first answer with a temporary visual overlay that points to the relevant part of the page.

The project is an early working prototype. It is designed for technical coursework—math, physics, economics, chemistry, and related subjects—but can use any readable course material.

## What already works

- Live iPad screen capture over the local network, at roughly one frame per second
- One-click Mac screen capture for testing without an iPad
- Spoken or typed questions about the current page
- Local Whisper speech recognition and local Kokoro speech output, with the macOS system voice as a fallback
- Hint-first tutoring, step-by-step work checking, explicit answer/walkthrough requests, and short spoken replies
- Read-only visual guidance over the captured page: highlights, boxes, arrows, numbered steps, and ghosted next-step sketches
- Separate courses with dated syllabi, slides, assignments, rubrics, notes, study history, and optional spaced-review memory
- A visible ChatGPT/Codex account panel with connection status, browser sign-in, refresh, and guarded sign-out

## Exactly what powers the AI

Study Companion does not silently use an API key bundled into the app. It uses the official **Codex runtime installed on the Mac** and the account connected to that runtime.

The account button in the app header always shows the current state:

- **ChatGPT connected** means Codex reports `Logged in using ChatGPT`. Tutor requests use that ChatGPT-connected Codex session, subject to the account's plan, access, and usage limits.
- **API key connected** means the user's Codex installation was configured with an API key instead. The app labels this explicitly.
- **Connect ChatGPT** means no usable Codex login was found. Clicking it runs the official Codex browser sign-in flow.
- **Set up AI** means no Codex executable was found. Install the ChatGPT desktop app or Codex CLI, then reopen Study Companion.

This first version delegates authentication to Codex rather than handling OAuth tokens itself. Study Companion never receives a ChatGPT password, does not read ChatGPT conversations, and does not contain a developer-owned API key. **Sign out** runs the Codex logout command, so it also disconnects other tools using the same Codex CLI login on that Mac. It does not sign the browser out of chatgpt.com and does not delete Study Companion's local course data.

## Privacy and data flow

| Stays on the user's devices | Sent to OpenAI when the user asks |
| --- | --- |
| Live iPad-to-Mac frame transport, microphone audio, speech transcription, spoken reply generation, imported course files, session history, and optional course memory | The saved question screenshot, the question, a short recent transcript, and only the retrieved course excerpts relevant to the question |

Frames travel directly from iPad to Mac over the local network. The Mac keeps the latest live frame in memory. When the user asks a question, the app saves that frame in the local session and supplies it to the authenticated Codex runtime.

Imported files are read and copied into Study Companion's local data model; the originals are not edited. The teaching overlay exists only in the Mac app and never writes into Notability or the shared screen.

Local app data is stored under:

```text
~/Library/Application Support/study-companion/
```

Deleting a course removes its copied context, messages, and review queue. Session screenshots are moved to a local recovery archive under the same application-data directory.

## Requirements

### Mac

- macOS on Apple silicon or Intel
- Node.js 22 or newer for development
- The ChatGPT desktop app with Codex, or a working Codex CLI installation
- Microphone permission for spoken questions
- Screen Recording permission only when using **Use Mac screen**
- Mac and iPad on the same local network for live iPad capture

If Codex is installed in a non-standard location, launch with:

```bash
STUDY_CODEX_PATH=/absolute/path/to/codex npm start
```

### iPad

- An iPad running iPadOS 27 or newer
- Xcode 27 or newer on the Mac to build the included companion app
- A free or paid Apple developer team selected in Xcode

The current iPad companion uses the iPadOS ScreenCaptureKit content-sharing picker, so its deployment target is intentionally iPadOS 27.

## Install and run the Mac app

```bash
git clone https://github.com/noamavivinyc-dev/StudyCompanion.git
cd StudyCompanion
npm install
npm start
```

On first launch:

1. Open the account button in the top bar.
2. If it says **Connect ChatGPT**, click **Continue with ChatGPT** and finish the official sign-in in the browser.
3. Return to Study Companion. The button should now say **ChatGPT connected**.
4. If it does not update, open the account panel and click **Refresh**.
5. Create a course, start a session, and either connect the iPad or click **Use Mac screen**.

The first voice interaction downloads the local Whisper and Kokoro model files. That first request can take longer. Until Kokoro is ready, the app uses the built-in macOS voice so the reply is still spoken.

## Daily study workflow

1. Click **＋ New** and create a course such as `Physics 201`.
2. Open **Course library** and add a syllabus, current assignment, rubric, lecture slides, or notes.
3. Check the detected material type and date. More recent, relevant material is preferred during retrieval.
4. Click **Start session**.
5. Start Study Capture on the iPad and share the screen containing Notability.
6. Ask naturally: “What is this asking?”, “Check my work,” or “Give me one hint for the next step.”
7. The assistant speaks by default and places temporary guidance over its own preview. Use **Voice off** to mute or **Guidance off** to hide overlays.
8. Turn on **Hands-free** to resume listening automatically after every answer.
9. Ask explicitly for “the answer,” “a complete solution,” or “walk me through it” when a hint is not enough.
10. End the study session when finished.

Study Companion defaults to the least revealing useful hint. For work checks, it confirms correct steps, identifies the first meaningful mistake, and suggests the next action. Course memory is opt-in; when enabled, it creates a private, course-specific spaced-review queue.

## Add course context

Open **Course library → ＋ Add files**. Supported import formats are:

```text
PDF, PPTX, TXT, Markdown, CSV, DOC, DOCX, and RTF
```

For each file you can set:

- **Type:** syllabus, assignment, slides, rubric, or notes
- **Date:** the source or class date used to resolve newer versus older context

Syllabi are also scanned for dated exams, assignments, and deadlines, which appear in **Course pulse**. Removing a material only removes Study Companion's imported copy; it does not delete the original file.

## Build and run the iPad companion

1. Open `ipad/StudyCapture.xcodeproj` in Xcode.
2. Select the **StudyCapture** target.
3. Under **Signing & Capabilities**, choose your Apple development team. If necessary, change the bundle identifier from `com.studycompanion.capture` to a unique value.
4. Connect the iPad, select it as the run destination, and press **Run**.
5. Accept the local-network permission prompt on the iPad.
6. In the Mac app, look at the empty notebook panel and copy the displayed Mac address and pairing code.
7. Enter both values in Study Capture and tap **Choose screen to share**.
8. Select the desired screen/app in Apple's picker, then return to Notability. Leave Study Capture running.

The pairing code is generated locally. A receiver request without the matching bearer token is rejected. For this prototype, traffic is plain HTTP on the trusted local network; do not expose the receiver port to the public internet.

## Package a Mac build

```bash
npm run pack
```

The unpacked development build is created under `dist/mac-arm64/` on Apple silicon or the matching architecture directory on Intel. The build is not notarized or Developer ID signed. On another Mac, the user may need to right-click the app and choose **Open** the first time. Production distribution should add signing, hardened runtime, notarization, and release packaging.

## Test

```bash
npm test
npm audit
```

ScreenCaptureKit is available to this target through the iPad device SDK, not the simulator SDK. Validate the unsigned device build with:

```bash
xcodebuild -project ipad/StudyCapture.xcodeproj \
  -scheme StudyCapture \
  -sdk iphoneos \
  -destination 'generic/platform=iOS' \
  -configuration Debug \
  CODE_SIGNING_ALLOWED=NO build
```

## Troubleshooting

### The account button says “Set up AI”

Install the ChatGPT desktop app with Codex or install the Codex CLI, then fully quit and reopen Study Companion. For an unusual install location, set `STUDY_CODEX_PATH` as shown above.

### Browser sign-in finished but the app still says disconnected

Open the account panel and click **Refresh**. From Terminal, `codex login status` should report the actual login method. If it does not, run `codex login`, finish the browser flow, and reopen the app.

### I do not want this Mac to keep using my account

Open the account panel and click **Sign out**. Read the warning: this signs the shared Codex CLI out for other local tools too. It leaves the ChatGPT website session and Study Companion's local data alone.

### The iPad cannot reach the Mac

- Put both devices on the same Wi-Fi network.
- Re-enter the complete address and port shown by the Mac app.
- Confirm the pairing code, including all characters.
- Allow local-network access on the iPad.
- Check whether macOS Firewall or a VPN is blocking local connections.
- Keep the Mac app open while sharing.

### The Mac screen is blank

Open **System Settings → Privacy & Security → Screen Recording**, allow Study Companion (or Electron during development), then restart the app.

### The microphone does not work

Open **System Settings → Privacy & Security → Microphone**, allow Study Companion (or Electron during development), then retry. Typed questions remain available.

### The first spoken question is slow

Whisper and Kokoro download their local model files on first use. Watch the voice status in the toolbar. Later uses load from the local cache.

### The tutor picked old course information

Open Course library and correct the material type and date. Remove superseded material if it should never be consulted. Retrieval favors both relevance and recency, but contradictory files should be cleaned up explicitly.

## Project structure

```text
main.js                         Electron main process and IPC
preload.js                      Narrow renderer bridge
renderer/                       Mac app interface
src/codex-tutor.js              Codex discovery, account state, and vision tutor
src/frame-server.js             Authenticated local iPad frame receiver
src/asr-service.js              Local speech recognition
src/voice-service.js            Local speech synthesis and fallback
src/store.js                    Courses, sessions, screenshots, and memory
src/materials.js                Course-material extraction
src/retrieval.js                Relevant and recent context selection
src/syllabus.js                 Syllabus event extraction
schemas/tutor-response.schema.json
ipad/                           Native Study Capture app and Xcode project
tests/                          Node test suite
```

See [`docs/LEARNING-SCIENCE.md`](docs/LEARNING-SCIENCE.md) for the evidence-to-product decisions behind the tutoring policy, hint ladder, retrieval practice, and spaced review behavior.

## Current limitations

- macOS and iPad only
- The iPad companion requires iPadOS 27
- Authentication is shared with the local Codex CLI rather than stored as an app-specific connection
- Live frames use authenticated but unencrypted HTTP on the local network
- The Mac build is not signed or notarized
- Handwriting and overlay placement depend on image quality and model confidence
- No collaborative/cloud sync; all course organization is local to one Mac

## Safety and academic use

The assistant can make mistakes, especially with unclear handwriting, cropped problems, or domain-specific notation. Verify high-stakes calculations and lab or safety instructions independently. The default hint-first behavior is meant to support learning, not bypass course policies.
