# Study Companion

Study Companion is a local-first Mac and iPad study copilot. Share an iPad screen while writing in Notability (or another app), ask a question out loud, and get a spoken, hint-first answer with a temporary visual overlay that points to the relevant part of the page.

The project is an early working prototype. It is designed for technical coursework—math, physics, economics, chemistry, and related subjects—but can use any readable course material.

> Upgrading from 0.1? Version 0.2 removes the external Codex-runtime dependency. Replace the old app, open the account panel, and connect ChatGPT directly inside Study Companion.

## What already works

- Live iPad screen capture over the local network, at roughly one frame per second
- One-click Mac screen capture for testing without an iPad
- Spoken or typed questions about the current page
- Local Whisper speech recognition and local Kokoro speech output, with the macOS system voice as a fallback
- Hint-first tutoring, step-by-step work checking, explicit answer/walkthrough requests, and short spoken replies
- Read-only visual guidance over the captured page: highlights, boxes, arrows, numbered steps, and ghosted next-step sketches
- Separate courses with dated syllabi, slides, assignments, rubrics, notes, study history, and optional spaced-review memory
- App-specific **Continue with ChatGPT** sign-in, visible account state, encrypted local credentials, usage settings, and guarded sign-out

## Exactly what powers the AI

Study Companion does not ship a developer-owned API key and does not require Codex, the ChatGPT desktop app, or a CLI. It uses OpenAI's official **Sign in with ChatGPT** flow for open-source local apps. Each installation registers Study Companion as its own OAuth client, and each user connects their own eligible ChatGPT account.

The account button in the app header always shows the current state:

- **ChatGPT connected** means the named account granted Study Companion direct token-sharing permission. Tutor requests use that account's ChatGPT plan and limits.
- **Enable ChatGPT plan** means the identity is signed in but direct plan access was not granted. Click **Continue with ChatGPT** to consent.
- **Reconnect ChatGPT** means the app-specific connection expired or was revoked.
- **Connect ChatGPT** means this copy of Study Companion has no connected account yet.

The password is entered only on OpenAI's site. OAuth credentials are kept in the main process, encrypted with Electron `safeStorage` backed by macOS secure storage, and never exposed to the renderer. **Sign out** revokes and removes only Study Companion's connection; it does not disconnect Codex, sign the browser out of chatgpt.com, or delete course data.

Direct inference uses the account's available model catalog and the Responses API with `store: false` and `stream: true`. Each request contains only the current question, current screenshot when present, a short recent transcript, and retrieved course excerpts. Sign in with ChatGPT is currently available to eligible ChatGPT accounts and remains subject to OpenAI's plan, region, and usage limits.

## Privacy and data flow

| Stays on the user's devices | Sent to OpenAI when the user asks |
| --- | --- |
| Live iPad-to-Mac frame transport, microphone audio, speech transcription, spoken reply generation, imported course files, session history, and optional course memory | The saved question screenshot, the question, a short recent transcript, and only the retrieved course excerpts relevant to the question |

Frames travel directly from iPad to Mac over the local network. The Mac keeps the latest live frame in memory. When the user asks a question, the app saves that frame in the local session and sends it through the user's app-specific ChatGPT connection.

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
- An eligible ChatGPT account for AI tutoring; no API key, ChatGPT desktop app, or Codex installation is required
- Microphone permission for spoken questions
- Screen Recording permission only when using **Use Mac screen**
- Mac and iPad on the same local network for live iPad capture

### iPad

- An iPad running iPadOS 27 or newer
- Xcode 27 or newer on the Mac to build the included companion app
- A free or paid Apple developer team selected in Xcode

The current iPad companion uses the iPadOS ScreenCaptureKit content-sharing picker, so its deployment target is intentionally iPadOS 27.

## Install and run the Mac app

### Ready-to-run download

Open [GitHub Releases](https://github.com/noamavivinyc-dev/StudyCompanion/releases), download the ZIP matching the Mac (`arm64` for Apple silicon, `x64` for Intel), unzip it, and move **Study Companion** to Applications. This prototype is not notarized, so the first launch may require right-clicking the app and choosing **Open**. If macOS still blocks it, follow the exact Gatekeeper steps in the release notes; never bypass security for a file downloaded from anywhere except this repository's Releases page.

### Run from source

```bash
git clone https://github.com/noamavivinyc-dev/StudyCompanion.git
cd StudyCompanion
npm install
npm start
```

On first launch:

1. Open the account button in the top bar.
2. If it says **Connect ChatGPT**, click **Continue with ChatGPT** and finish the official sign-in in the browser.
3. Approve Study Companion's requested plan access, then return to the app. The button should say **ChatGPT connected** and the panel should show the selected account.
4. If it does not update, open the account panel and click **Refresh**.
5. Create a course, start a session, and either connect the iPad or click **Use Mac screen**.

The first voice interaction downloads the local Whisper and Kokoro model files. That first request can take longer. Until Kokoro is ready, the app uses the built-in macOS voice so the reply is still spoken.

For the full authentication flow, secure-storage behavior, and error recovery, see [`docs/CHATGPT-SIGN-IN.md`](docs/CHATGPT-SIGN-IN.md).

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

Create distributable ZIPs with:

```bash
npm run dist:mac:arm64   # Apple silicon
npm run dist:mac:x64     # Intel
```

Each distribution command performs a clean install for its target CPU first, which is required for native speech/image dependencies when cross-building on the other Mac architecture. Electron Builder omits `x64` from its default Intel filename; rename that ZIP to include `x64` before publishing it.

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

### Browser sign-in finished but the app still says disconnected

Return to Study Companion and click **Refresh**. If the panel says **Enable ChatGPT plan**, click **Continue with ChatGPT** once more and approve direct plan access. If OpenAI reports that the account is ineligible, use an eligible personal ChatGPT account or workspace and verify that the serving region and usage limits permit token sharing.

### Secure credential storage is unavailable

Unlock the Mac login keychain, fully quit Study Companion, and reopen it. The app intentionally refuses to save OAuth credentials without OS-backed encryption.

### I do not want this Mac to keep using my account

Open the account panel and click **Sign out**. This revokes Study Companion's app connection and removes its encrypted local credentials. It leaves the ChatGPT website session, Codex, and Study Companion's local course data alone.

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
src/chatgpt-tutor.js            ChatGPT account state, direct vision inference, and tutor policy
src/credential-encryption.js   macOS-backed credential encryption adapter
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
vendor/siwc-local/              OpenAI Sign in with ChatGPT local SDK + notices
```

See [`docs/LEARNING-SCIENCE.md`](docs/LEARNING-SCIENCE.md) for the evidence-to-product decisions behind the tutoring policy, hint ladder, retrieval practice, and spaced review behavior.

The account implementation follows OpenAI's [Sign in with ChatGPT integration guide](https://developers.openai.com/cookbook/articles/sign-in-with-chatgpt), [local-app sign-in specification](https://developers.openai.com/siwc/token-sharing-open-source/sign-in), and [models and inference requirements](https://developers.openai.com/siwc/token-sharing-open-source/models-and-inference). The vendored local SDK comes from OpenAI's [Sign in with ChatGPT DevKit](https://github.com/openai/sign-in-with-chatgpt-devkit); its noncommercial license, modification notice, and third-party notices are included under `vendor/siwc-local/`.

## Current limitations

- macOS and iPad only
- The iPad companion requires iPadOS 27
- Sign in with ChatGPT is a preview and is limited to eligible accounts, supported regions, and the user's plan limits
- Live frames use authenticated but unencrypted HTTP on the local network
- The Mac build is not signed or notarized
- Handwriting and overlay placement depend on image quality and model confidence
- No collaborative/cloud sync; all course organization is local to one Mac

## Safety and academic use

The assistant can make mistakes, especially with unclear handwriting, cropped problems, or domain-specific notation. Verify high-stakes calculations and lab or safety instructions independently. The default hint-first behavior is meant to support learning, not bypass course policies.
