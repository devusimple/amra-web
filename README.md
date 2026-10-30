# amra

A peer-to-peer messaging and calling client for the
[amra-signal](https://amra-signal.devusimple.workers.dev/docs) API.

Chat, audio and video all travel directly between browsers over WebRTC. The
server only brokers authentication and the SDP/ICE handshake.

## Features

- Email + password auth (30-day JWT, persisted in `localStorage`)
- Contact directory with search and cached public profiles
- Peer-to-peer chat over an `RTCDataChannel`
  - messages stored locally in IndexedDB (Dexie) and synced when a peer connects
  - delivery states (pending / sent / delivered) and offline queueing
  - glare-safe: simultaneous offers resolve to a single session
- Audio and video calls with mute / camera toggle, call timer and ring timeout
- Incoming-call screen with accept / decline
- Editable profile (display name, bio, avatar URL)
- Responsive dark UI for desktop and mobile

## Stack

- React 19 + TypeScript + Vite
- Tailwind CSS v4
- `openapi-fetch` with types generated from the live OpenAPI document
- Dexie (IndexedDB) for local chat history and profile cache
- WebRTC (`RTCPeerConnection` + `RTCDataChannel`)

## Getting started

```bash
bun install
bun run dev
```

Open the printed URL. Use two different accounts (e.g. one normal window and
one private window) to try messaging and calls.

> Camera and microphone access require `localhost` or HTTPS.

## How it works

1. `POST /api/auth/login` → JWT, attached as `Authorization: Bearer …` by the
   request middleware in `src/api/client.ts`.
2. `CallManager` (`src/lib/call-manager.ts`) polls `/api/signal/calls/pending`
   for incoming offers.
3. Opening a conversation posts a data-channel-only offer. The peer's app
   answers silently, then messages flow over the data channel. Media offers
   (containing `m=audio` / `m=video`) ring the peer instead.
4. Both sides trickle ICE candidates through the REST API with cursor paging,
   then talk directly peer to peer.
5. Chat history is written to IndexedDB first, so messages survive reloads and
   are re-sent when the channel reconnects.

## Configuration

Requests are made relative to the page origin, which is what the API expects
(it does not send CORS headers). During `dev` and `preview`, `vite.config.ts`
proxies `/api`, `/ws`, `/openapi.json` and `/docs` to the live worker, so the
app behaves exactly like a same-origin deployment.

To use a different API host, set `VITE_API_BASE_URL` (see `.env.example`). That
host must allow cross-origin requests, otherwise the browser will block them.

### Deploying

The simplest deployment serves the built `dist/` from the same origin as the
API. If you host the static build elsewhere, add server-side rewrites so the
browser still sees same-origin URLs:

```json
{
  "rewrites": [
    { "source": "/api/:path*", "destination": "https://amra-signal.devusimple.workers.dev/api/:path*" }
  ]
}
```

(The worker does not currently answer CORS preflight with an
`Access-Control-Allow-Origin` header, so proxying/rewriting is required.)

To regenerate the API types from the live document:

```bash
bunx openapi-typescript https://amra-signal.devusimple.workers.dev/openapi.json -o src/api/schema.d.ts
```

## Scripts

- `bun run dev` — start the Vite dev server
- `bun run build` — type-check and produce a production build in `dist/`
- `bun run preview` — preview the production build
- `bun run lint` — run Oxlint
