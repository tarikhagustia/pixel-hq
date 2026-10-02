# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

Pixel HQ: a Stardew-style pixel-art virtual office (Gather.town-like) for small dev teams — proximity voice/chat/meetings in the browser. npm workspaces monorepo: `server` (Node + `ws`) and `client` (React + Vite + Zustand), sharing wire-protocol types from `shared/`. All art is generated procedurally in code — there are no image/sprite asset files to edit.

## Commands

```bash
npm install
npm run dev          # server :3001 + Vite :5173 (concurrently), open http://localhost:5173
npm run build         # builds client then server (client -> client/dist, server -> esbuild bundle)
npm start             # runs the built server (single port, serves client/dist + /ws)
npm run typecheck     # tsc --noEmit for both workspaces
```

Single-workspace equivalents: `npm run dev -w server`, `npm run dev -w client`, `npm run typecheck -w client`, etc.

There is no test suite and no linter configured in this repo — don't invent `npm test`/lint commands.

Docker: `docker compose up --build` (multi-stage `Dockerfile`, builds then runs `node server/dist/index.js` on `:3001`).

### Environment variables (server)
`PORT` (3001), `MAX_PLAYERS` (16), `ICE_SERVERS` (JSON array of `RTCIceServer`, defaults to Google STUN — add a TURN server for users behind symmetric/corporate NAT), `STATIC_DIR` (defaults to `client/dist`).

Note: WebRTC mic/camera requires HTTPS everywhere except `localhost`; a reverse proxy must forward the WebSocket upgrade on `/ws`.

## Architecture

```
shared/protocol.ts        typed wire protocol + constants (imported by BOTH client and server —
                           keep it dependency-free; this is the single source of truth for message shapes)
server/src/index.ts       one file: presence, 15 Hz movement snapshots, chat routing
                           (global / nearby-by-distance / dm), rate limiting, WebRTC signaling relay,
                           heartbeat/reconnect, static file hosting. In-memory state, single process.
client/src/
  game/
    map.ts                office layout: floors, walls, furniture, seats, zones, collision grid
    pixel.ts              pixel-art toolkit (auto-outline, shading, deterministic noise)
    art/tiles.ts           bakes floors/walls/rugs/wall decor into one static canvas
    art/furniture.ts       procedural furniture sprites + per-frame animations
    art/character.ts       palette-swappable character sprite sheets (4 dirs, walk/sit/blink)
    art/palette.ts         shared color palette helpers
    input.ts               keyboard input (ignores typing in text inputs)
    engine.ts               game loop: input, collision, seats, click-to-walk (BFS pathfinding),
                           interpolation, camera, y-sorted (depth) rendering, name tags & chat bubbles
  net/socket.ts            WebSocket client → feeds store/live state
  rtc/media.ts             mic (+ voice-activity detection), camera, screen share capture
  rtc/peers.ts             proximity/meeting mesh: 3 fixed transceivers per peer (mic, cam, screen);
                           toggles use replaceTrack (no renegotiation)
  state/store.ts           Zustand store for UI state (presence, chat, toggles, settings)
  state/live.ts            mutable per-frame positions & speech bubbles, deliberately kept OUT of
                           React state (avoids re-renders at 15 Hz)
  ui/                      React HUD: join screen, player card, dock, chat, people panel,
                           media strip / meeting stage, settings, toasts
```

### Key design points to preserve when editing

- **`shared/protocol.ts` is the contract.** `Motion` (per-frame: x/y/dir/moving/seat) is split from `Presence` (slower-changing: name/avatar/status/mic/cam/screen/speaking/inMeeting/zone) because they're sent at different rates — movement via compact tuple `snapshot` broadcasts at 15 Hz, presence via sparse `presence` patches. Changing a message shape means updating both `server/src/index.ts` and the relevant client consumer (`net/socket.ts`, `rtc/*`, `ui/*`) since there's no codegen.
- **Voice model**: at most one `RTCPeerConnection` per pair of players, opened only while they should hear each other — both in the meeting room (`zone === 'meeting'`) or both outside it, both `status === 'available'`, and within `VOICE_RADIUS` (hysteresis avoids connect/disconnect flapping). The lower-id peer always offers (avoids glare). Audio volume follows distance via the `<audio>` element's gain, not WebRTC-level.
- **Server never trusts client input** — every incoming field is clamped/sanitized (`clean`, `sanitizeAvatar`, `num`, enum checks) in `server/src/index.ts` before being stored or rebroadcast. Keep new message fields sanitized the same way.
- **Meeting room isolation**: `sameRoom()` in the server gates both nearby-chat delivery and (client-side) voice — players in the meeting room and players outside it never hear/see each other's nearby activity, even at close map proximity.
- **Scaling ceiling, by design**: full-mesh WebRTC suits ≤10 people (each user uploads one stream per neighbour); server presence state is in-memory, single office/process. The README's "Ideas for next steps" notes swapping `rtc/peers.ts` for an SFU (LiveKit/mediasoup) and adding Redis pub/sub as the documented paths past this ceiling — don't silently try to "fix" the mesh/in-memory model as if it were a bug.
- **`state/live.ts` vs `state/store.ts`**: anything updated every animation frame (positions, bubble text) goes in `live.ts` (plain mutable object, read directly by the canvas renderer) to avoid React re-render cost; anything UI-driven goes in the Zustand `store.ts`. Don't move per-frame data into the Zustand store.
