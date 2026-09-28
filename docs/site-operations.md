# Deploy the web-ide classroom host

For the reusable component, see [self-hosting the IDE component](https://github.com/justinvassantachart/web-ide/blob/main/docs/self-hosting.md).
These notes cover this repository’s complete classroom host.

The public IDE, linked-list example, and ten lessons can be served as a static
website. A compilation server is not required. Classroom accounts and cloud
storage are optional and use Firebase.

## Build a local copy

These commands run from an existing checkout of this site repository. Use
Node.js 20.19+ or 22.12+ (or a compatible newer release).

```sh
npm ci
npm run dev
```

Open the local address printed by Vite. For a production build:

```sh
npm run build
npm run preview
```

Publish `dist/`. Dependencies include a pinned public debugger-engine release;
see [compiler assets and precompiled headers](compiler-performance.md) for the
runtime's matching assets and reproduction instructions.

## Netlify

Import your repository into Netlify and select the branch you want to deploy.
The checked-in `netlify.toml` specifies `npm run build`, the `dist` publish folder,
SPA redirects, asset caching, and browser isolation headers. Git-based continuous
deployment is a setting of the Netlify project: the presence of this file alone
does not enable deployments on pushes.

After deployment, open `/`, `/ide?example=linked-list`, `/learn`, and a direct
`/learn/<lesson-slug>` URL. Run a program and pause at a breakpoint. Verify that
the linked-list workspace on the landing page can also run.

Check `/build-info.json` to identify the deployed Git commit and debugger engine.
The site uses the customized workbench in `packages/web-ide`, based on 0.3.1;
it does not currently use the separately published 0.7 component. The customized
workbench supplies the landing demo's initial breakpoint, PCH rejection fallback,
symbol renaming, and graph layout. Replacing it with a release package requires
verifying these behaviors first. License notices are published under `/licenses/`.

## Other static hosts

Reproduce the rules in `netlify.toml`:

- Serve real static files before falling back to `index.html` for application URLs.
- Send `Cross-Origin-Opener-Policy: same-origin` and
  `Cross-Origin-Embedder-Policy: require-corp` on the landing page, IDE, lessons,
  demo, and classroom routes. The landing page's live iframe needs an isolated
  top-level document as well as an isolated child document.
- Serve `/login` with both policies set to `unsafe-none`, so authentication popups
  can communicate with the sign-in page. Use a full navigation when moving between
  sign-in and an IDE route.
- Use HTTPS (localhost is allowed during development). Check that
  `window.crossOriginIsolated` is `true` in the IDE and its live frame.
- Revalidate HTML, service workers, and runtime assets with stable filenames.
  Fingerprinted files in `/assets/` can use immutable caching.
- Serve `.wasm` as `application/wasm`. Permit the runtime's asset downloads.

Keep `public/coep-sw.js` at `/coep-sw.js`. The workspace bootstrap registers it
before Firebase requests on isolated pages; it handles the cross-origin responses
used by the classroom integration. `vite preview` applies the same route-specific
isolation headers for local verification.

## Optional classroom setup

1. Create a Firebase project and web app. Enable Google sign-in and a Firestore
   database. Add your hosted domain to Firebase Authentication's authorized domains.
2. Copy `.env.example` to `.env.local` and fill in the six `VITE_FIREBASE_*` web-app
   configuration values. Set the same values in your host's build environment.
   These are client web-app settings, not service-account credentials.
3. Deploy the checked-in `firestore.rules` to your project. The rules enforce
   teacher, class-member, and per-student access. Never substitute an unrestricted
   database for these rules.
4. Rebuild the site. Verify sign-in and the teacher/student workflow using a test
   class and separate accounts before inviting a real class.
5. Follow the [instructor guide](teaching.md) to create and publish assignments.

The editor and anonymous lessons continue to work without Firebase settings.
Classroom storage may incur charges under your provider's plan; local compilation
itself does not use a hosted compute service.

## Browser storage and extensions

Lesson progress and workspaces use browser storage. Use a stable origin if you
want returning students to retain that local work. The showcase and its full-page
version deliberately share a workspace, while each lesson has its own workspace.

To customize the UI or connect your own saving backend, start with the
[React workbench guide](../packages/web-ide/README.md). Its host API supplies
initial files and save/flush callbacks independently of Firebase.
