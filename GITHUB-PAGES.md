# Signal Mirror — portable installation edition

This edition is a static React/WebGL app. It requires no Sites server, API keys,
cloud inference, or database. Webcam images are processed on the computer.
The existing Sites build is preserved; `build:pages` is the standalone build.

## Publish the source package

1. Create or choose a GitHub repository. Confirm you are allowed to publish the
   included CTRL+SHIFT and Ambition brand assets. GitHub Pages sites are normally
   public, even when the source repository is private.
2. Put the source package contents at the repository root on `main`, including
   the hidden `.github/workflows/pages.yml` directory. Do not upload either ZIP.
3. Under **Settings → Pages → Build and deployment → Source**, choose
   **GitHub Actions**.
4. Push to `main`, or run **Publish Signal Mirror** from the Actions tab.
5. Wait for the deploy job to succeed. GitHub displays the actual Pages URL in
   the deployment and in Settings → Pages. Use that HTTPS link on each computer.

Asset URLs and service-worker scope are relative, so both a repository subpath
and a root/custom-domain installation work without editing the source.

## Alternative: upload the ready-built package

Extract the contents of the `site` ZIP into a repository root (including
`.nojekyll`). Set Pages to **Deploy from a branch**, select that branch and `/`.
This requires no Node.js or build job. Do not add the source workflow to this
ready-built-only repository.

## First run and offline use

1. Open the HTTPS link while connected to the internet. Keep the tab open until
   the control panel says **Ready offline on this device**. This includes all
   tracking models and WASM files, not just the interface.
2. Enable camera access, select your USB camera under **CAMERA INPUT**, and
   press **APPLY CAMERA**. The choice is remembered in this browser on this device.
3. Disconnect from the network and reload the same URL to verify before an event.
   Each computer/browser profile needs its own first download. Private browsing,
   browser storage cleanup, or storage eviction may remove the offline copy.
4. New releases download separately. The old version keeps running until you
   press **UPDATE READY — RELOAD** or close all app tabs. Do not update during a show.

Offline support belongs to this standalone edition. It is not registered on the
owner-private Sites-hosted version, avoiding caching its authentication wrapper.

## Windows installation checklist

- Use a current browser with WebGL, service workers, and webcam support.
- Confirm the USB camera appears as a webcam in Windows. Permit desktop-browser
  camera access in Windows privacy settings and allow this site's camera prompt.
- Start with 720p camera input and a 1080p projector. The app requests 30 fps and
  caps internal rendering at 1920×1080. Camera hardware may negotiate other values.
- Set Windows to Extend, move the app to the projector, then press F to project.
- Space cycles FX, 1–8 selects FX, P freezes, F toggles projection.
- Hold an index fingertip over the glowing finger button on the right to change
  FX. Move away before repeating. A thumbs-up fires a particle burst.
- Keep faces lit and the laptop plugged in. Disable sleep/notifications and test
  the full installation for at least one event-length session.
- Helvetica Neue falls back to Helvetica/Arial unless installed on that machine.

## Local build

Node.js 22.13 or newer:

```sh
npm ci
npm run build:pages
npm run preview:pages
```

Open the printed localhost URL. Do not double-click index.html: `file://` does
not provide a reliable origin for camera permissions, workers, or offline storage.
No camera frames are uploaded. Snapshot/recording files download only when asked.
