# ChatGPT sign-in

Study Companion 0.2 uses OpenAI's app-specific **Continue with ChatGPT** flow. It does not look for a `codex` executable, does not borrow a Codex login, and does not require an API key.

## Connect an account

1. Launch Study Companion and click **Connect ChatGPT** in the top bar.
2. Click **Continue with ChatGPT**. The system browser opens an OpenAI authorization page.
3. Sign into the ChatGPT account whose plan you want to use.
4. Review and approve the requested direct plan access.
5. Return to Study Companion. The account card shows the account name or email and **Connected**.
6. Create or select a course, start a study session, share the iPad screen or click **Use Mac screen**, and ask a question.

The account must be eligible for Sign in with ChatGPT token sharing. Availability is controlled by OpenAI and can depend on plan, workspace policy, region, and current usage limits.

## What is stored

Study Companion creates a stable random host ID and receives an app-specific OAuth client ID. Access and refresh credentials are held only by the Electron main process. Before anything is written to disk, the complete credential record is encrypted with Electron `safeStorage`, which uses macOS secure storage. The renderer receives only safe session fields such as connected state, account name/email, and a sanitized error.

Files are stored under:

```text
~/Library/Application Support/study-companion/chatgpt/
```

The app deliberately refuses to save or read credentials when OS-backed encryption is unavailable. It never asks for or receives the ChatGPT password.

## What is sent when asking a question

The live iPad stream, imported files, local speech recognition, and speech generation remain local. A tutoring request sends:

- the current question;
- the current screenshot, when one is available;
- a short recent study-session transcript;
- only the course excerpts retrieved as relevant to the question.

Requests go directly to the Responses API with the user's OAuth access token, an account-available model, `store: false`, and `stream: true`. Images are attached as vision input. The tutor response uses a strict JSON schema so the visible answer, spoken reply, review prompt, and overlay coordinates can be handled separately.

## Account controls

- **Refresh** re-reads the encrypted app-specific connection.
- **Manage usage** opens ChatGPT's usage settings for the connected plan.
- **Sign out** attempts to revoke the connection and always removes Study Companion's local credentials. It does not sign out of chatgpt.com, disconnect Codex, or remove course data.
- **Enable ChatGPT plan** means identity sign-in completed but direct plan access was not granted. Click **Continue with ChatGPT** and approve the permission.
- **Reconnect ChatGPT** means the saved authorization expired, was revoked, or can no longer refresh.

## Troubleshooting

### The browser never opens

Quit duplicate copies of Study Companion and try again. The OAuth callback listens only on a temporary IPv4 loopback port (`127.0.0.1`) and never accepts LAN callbacks. A firewall or endpoint-security tool that blocks loopback listeners can prevent sign-in.

### The browser says the account is not eligible

Try an eligible personal ChatGPT account. Managed workspaces can disable token sharing. The app cannot substitute an API key or charge a developer account.

### Sign-in returns to the app but access is not enabled

Open the account panel. If it shows **Enable ChatGPT plan**, click **Continue with ChatGPT** again; this is the explicit re-consent action. If it remains disconnected, click **Refresh** and read the sanitized error in the account card.

### Secure credential storage is unavailable

Unlock the login keychain, fully quit the app, and reopen it. Do not delete `chatgpt-auth.json` while recovering Keychain access; it contains the encrypted connection and is intentionally preserved on decryption errors.

### A plan or usage limit is reached

Click **Manage usage**. Limits come from the connected user's ChatGPT plan. Switching plans or accounts is handled on OpenAI's site; this app does not meter or bill usage.

## Developer implementation notes

The OAuth and token-refresh implementation is OpenAI's local DevKit, vendored from commit `f723814abdccec135b519c451fb6e1992ee5e933`. Study Companion extends its Responses transport to accept documented image content parts and `text.format` JSON schema configuration. The modified file is marked, and the DevKit noncommercial license and third-party notices are preserved in `vendor/siwc-local/`.

Relevant upstream material:

- [Integration guide](https://developers.openai.com/cookbook/articles/sign-in-with-chatgpt)
- [Sign-in protocol](https://developers.openai.com/siwc/token-sharing-open-source/sign-in)
- [Models and inference](https://developers.openai.com/siwc/token-sharing-open-source/models-and-inference)
- [Preview limitations](https://developers.openai.com/siwc/token-sharing-open-source/preview-limitations)
- [Errors and recovery](https://developers.openai.com/siwc/token-sharing-open-source/errors-and-recovery)
- [OpenAI DevKit source](https://github.com/openai/sign-in-with-chatgpt-devkit)
