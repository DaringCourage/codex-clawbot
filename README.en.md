# wechat-codex-bridge

A minimal local bridge that connects WeChat ClawBot to your own local Codex.

The intended deployment model is simple:

- each person runs the bridge on their own Mac
- each person signs in with their own WeChat ClawBot
- each person uses their own local `codex`
- no shared server, no shared bot token, no shared Codex session

## What It Does

1. Sign in to WeChat ClawBot by scanning a QR code
2. Poll the official iLink API for inbound messages
3. Forward each message to local `codex exec`
4. Send the final Codex reply back to WeChat

## Requirements

- macOS
- Node.js 20+
- `codex` installed and available in `PATH`
- WeChat ClawBot access on your own account

## Quick Start

```bash
git clone <your-repo-url>
cd wechat-codex-bridge
npm install
npm run init
```

If you want Codex to work inside a specific repo or workspace:

```bash
npm run init -- --force --workdir /path/to/your/workspace
```

Then sign in:

```bash
npm run setup
```

Check status:

```bash
npm run status
```

Run once in the foreground:

```bash
npm run start
```

Install as a background service:

```bash
npm run daemon:install
```

## Important Local Files

- `.env`: local machine config
- `data/account.json`: local WeChat bot credentials
- `data/state.json`: cursor, dedupe ids, and sender-to-thread mapping
- `data/last-exchange.json`: latest debug record for message delivery

Do not commit these local runtime files.

## Sharing This With Friends

The safest way is to share the repository, not your runtime state.

Each friend should:

1. install and log in to their own `codex`
2. clone this repo
3. run `npm install`
4. run `npm run init`
5. run `npm run setup`
6. run `npm run daemon:install`

Never share your own:

- `.env`
- `data/account.json`
- `data/state.json`
- runtime logs

## License

[MIT](./LICENSE)
