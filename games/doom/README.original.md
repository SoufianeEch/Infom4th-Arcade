# InfoM4th DOOM

An InfoM4th-themed browser game using the Chocolate Doom WebAssembly engine and Freedoom: Phase 1 game data. The faculty prototype is preserved separately in `prototype.html`.

## Run locally with Node

```powershell
node server.js
```

Open http://localhost:8080. The game runs in the browser; saves are temporary and are lost when the page is reloaded or exited.

## Run with Docker

Make sure Docker Desktop is running, then:

```powershell
docker compose up --build -d
```

Open http://localhost:8080. Stop it with `docker compose down`. The image listens on `PORT`, defaulting to 8080.

## Deploy to Railway

1. Put this folder in a GitHub repository. Include `Dockerfile`, `nginx/`, `index.html`, `theme/infom4th-logo.png`, and the complete `runtime/` folder. The runtime contains the engine, the Freedoom data, the InfoM4th menu and the required license/credit files.
2. In Railway, create a project from that GitHub repository. Railway detects the root Dockerfile automatically.
3. Once it deploys, go to the service's **Settings > Networking > Public Networking**, then select **Generate Domain**. If asked for a target port, use the service's `PORT` (normally 8080 unless configured otherwise).
4. Open the generated URL and test gameplay and touch controls.

The `doom-web/` and `doom-wasm/` checkouts are not needed in the container. `runtime/` **must** be present in the uploaded repository and Docker build context; its largest file, Freedoom, is about 29 MB.

## Rebuild the theme

If the runtime files need to be regenerated:

```powershell
git clone https://github.com/danborden1/doom-web.git doom-web
node setup-game.js
```

This copies the engine, assets and license files to `runtime/` and generates `runtime/infom4th-menu.wad` from the Freedoom palette. Node.js is required for this one-time setup.

## Licenses and sources

The engine is distributed under GPL v2; see `runtime/COPYING`. The corresponding source for the included prebuilt engine is [doom-wasm-pwa at a77edfd8bbc7](https://github.com/Saketh-Chandra/doom-wasm-pwa/tree/a77edfd8bbc7), as identified by the [doom-web distribution](https://github.com/danborden1/doom-web). Freedoom is distributed separately under its BSD license; see `runtime/FREEDOOM-COPYING.txt` and `runtime/FREEDOOM-CREDITS.txt`. The game uses Freedoom data, not id Software's proprietary WAD.
