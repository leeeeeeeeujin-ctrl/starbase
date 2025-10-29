# Local credentials / secrets (DO NOT COMMIT)

This file documents a safe way to provide local credentials or service-account data to the ai-roomchat server for testing/development.

Important:

- NEVER commit real secrets to the repository. Add the filename below to `.gitignore` (we add an entry in `ai-roomchat/.gitignore` for convenience).
- Do NOT paste passwords, private keys, or tokens into issues or chat with people you don't trust.

Recommended filename and location

- `ai-roomchat/local_credentials.json`

Supported example shapes

1. Gemini CLI configuration (if you have a local CLI wrapper that requires tokens):

```json
{
  "gemini": {
    "cliPath": "C:\\path\\to\\gemini.exe",
    "args": "--model=your-model --other-opts",
    "acceptStdin": true,
    "timeoutMs": 20000
  }
}
```

2. Generic provider credentials (example only — adjust to your provider's needs):

```json
{
  "providers": {
    "my-provider": {
      "apiKey": "sk-...",
      "endpoint": "https://api.example.com/v1/"
    }
  }
}
```

How to use this file from the server

- The project includes `ai-roomchat/lib/localSecrets.js`, which will attempt to load the file at `ai-roomchat/local_credentials.json` by default. It exposes `getLocalSecrets()`.
- Only server-side code (API routes, not client bundles) should call into `getLocalSecrets()` and use secrets. Do NOT import this module from code that runs in the browser.

Security notes

- Keep the file readable only by your user account.
- If you need CI usage, inject secrets via CI environment variables instead of checking this file into the repo.
- If you stop using a credential, remove it from disk.

If you want, I can create the template file for you (an example is provided above). I will not populate it with credentials you pasted in chat.
