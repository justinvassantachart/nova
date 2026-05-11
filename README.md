# Nova

A browser-based C++ IDE with in-browser compilation, step-through debugging, and live memory visualization — no installs required.

## Demo

<!-- Add a screen recording / GIF of the full workflow here -->
<!-- ![Demo video](./assets/demo.mp4) -->
- Video Demo
[![Video Thumbnail](./assets/video_thumbnail.png)](https://www.youtube.com/watch?v=HFhQspCLCtA)
- Live Demo [https://nova-ide.netlify.app](https://nova-ide.netlify.app)


## Features

- **Monaco code editor** with C++ syntax highlighting and autocomplete
- **In-browser compilation** via Clang compiled to WebAssembly (YoWasp)
- **Step-through debugger** with breakpoints, step-in/over/out, and full execution history
- **Live memory visualizer** - interactive graph of stack frames, heap allocations, and pointer relationships
![Memory & heap visualization](./assets/demo_memory-heap.png)
- **Integrated terminal** for program I/O
- **Multiple Files + Classes** - virtual filesystem is auto-saved locally and files can be included in programs like normal.
![Classes](./assets/demo_classes.png)
- **Canvas output** for graphics programs
![Canvas output](./assets/demo_canvas.png)

## TODO

- [ ] Connect terminal to STDIN
- [ ] Add intellisense
- [ ] Flesh out the graphics library

## Architecture

```
Source code → Clang (WASM) → Assembly → Instrumentation → WASM binary
                                                            ↓
                                          SharedArrayBuffer debugger
                                                            ↓
                                           DWARF line maps + variable info
                                                            ↓
                                              Memory snapshots → Visualizer
```

## Getting Started

```bash
npm install
npm run dev
```

Open [http://localhost:5173](http://localhost:5173).

The IDE is available at `/ide` standalone, with **no sign-in required**. To use the built-in LMS (teacher dashboards, student assignments, submission auto-save, research analytics), follow the self-hosting setup below.

## Self-hosting setup (built-in LMS)

Nova ships with a small in-repo LMS so a teacher can create assignments with starter files, students can open them in the IDE, and their work auto-saves to a database. All of this runs on free-tier **Firebase** — you don't need a server.

You only need to do this once per deployment.

### 1. Create a Firebase project

1. Go to <https://console.firebase.google.com> and click **Add project**.
2. Give it any name (e.g. `nova-lms`). You can skip Google Analytics.
3. Once the project is created, you'll land on its dashboard.

### 2. Enable Google sign-in

1. In the left sidebar, click **Build → Authentication → Get started**.
2. Open the **Sign-in method** tab.
3. Click **Google**, toggle it on, set a support email, and **Save**.
4. (Optional — recommended) Under **Settings → Authorized domains**, add the domain you'll deploy to (e.g. `your-app.netlify.app`). `localhost` is already there for local testing.

### 3. Create a Firestore database

1. In the left sidebar, click **Build → Firestore Database → Create database**.
2. Choose **Start in production mode** (you'll paste rules in step 5).
3. Pick a location close to your users (e.g. `nam5` for North America). This can't be changed later.

### 4. Register a web app and copy its config

1. On the project dashboard, click the **`</>` (Web)** icon next to "Get started by adding your first app".
2. Give it a nickname (e.g. `nova-web`). You **don't** need Firebase Hosting.
3. Firebase will show you a `firebaseConfig` block. Copy the six string values.
4. In this repo, copy `.env.example` to `.env.local`:
   ```bash
   cp .env.example .env.local
   ```
5. Paste the values into `.env.local`. The mapping is:

   | Firebase console field | `.env.local` key |
   |---|---|
   | `apiKey` | `VITE_FIREBASE_API_KEY` |
   | `authDomain` | `VITE_FIREBASE_AUTH_DOMAIN` |
   | `projectId` | `VITE_FIREBASE_PROJECT_ID` |
   | `storageBucket` | `VITE_FIREBASE_STORAGE_BUCKET` |
   | `messagingSenderId` | `VITE_FIREBASE_MESSAGING_SENDER_ID` |
   | `appId` | `VITE_FIREBASE_APP_ID` |

### 5. Install the security rules

The repo includes a `firestore.rules` file enforcing: students can only read/write their own submission docs, teachers can only edit their own assignments, the `events` analytics collection is append-only, etc. You **must** install these — without them anyone could read everyone's data.

Two options:

**Option A — Paste into the console (easiest, no extra tools):**

1. Open **Firestore Database → Rules** in the Firebase console.
2. Open `firestore.rules` in this repo and copy its entire contents.
3. Paste, overwriting whatever is there.
4. Click **Publish**.

**Option B — Firebase CLI (recommended if you'll iterate on rules):**

```bash
npm install -g firebase-tools
firebase login
firebase use --add   # pick the project you created
firebase deploy --only firestore:rules
```

### 6. Run it

```bash
npm install
npm run dev
```

Visit <http://localhost:5173>. You should see the sign-in page. Sign in with Google, pick "Teacher" the first time, and you're in.

### 7. Deploy (optional)

Any static host works — the repo includes a `netlify.toml` for Netlify with the SPA redirect and the COOP/COEP headers Nova needs for its in-browser debugger. Push to a Git host and connect it to Netlify (or your platform of choice). Remember to set the same `VITE_FIREBASE_*` environment variables in the host's dashboard.

### Notes for instructors

- **Roles are permanent** from the user's side. If a student picks "Teacher" by mistake, edit their `role` field directly in the Firestore console.
- **Submission size**: a single assignment + submission is limited to ~1 MB by Firestore. Plenty for typical CS-class assignments; unsuitable for large media.
- **Analytics**: every compile / run / edit / step is logged to the `events` collection with the student's UID, the assignment ID, and a session ID. Export to BigQuery via the Firebase Extensions marketplace if you want to analyze it offline.

## Tech Stack

| Layer | Technology |
|-------|------------|
| UI | React, Tailwind CSS, Radix UI |
| Editor | Monaco Editor |
| Compiler | YoWasp Clang (WebAssembly) |
| Debugger | Custom ASM instrumentation + SharedArrayBuffer |
| Visualizer | React Flow (xyflow) + dagre layout |
| State | Zustand |
| Terminal | xterm.js |

