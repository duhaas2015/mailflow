# Deploying Mailflow

## What actually ships

An Outlook add-in isn't a package you install. It's two separate things:

1. **`manifest.xml`** — a small pointer file. It declares the name, the icons,
   the ribbon button, the permission level, and the **URLs** where the code
   lives. This is the only file you upload to Microsoft.
2. **The contents of `dist/`** — the actual HTML, CSS, and JavaScript. These
   are **not** uploaded anywhere Microsoft controls. You host them yourself on
   an HTTPS origin, and Outlook fetches them at runtime, every time the task
   pane opens.

The practical consequence: **uploading the manifest is not enough.** If the
URLs inside it aren't reachable by the user's Outlook, they get a blank pane.
There is no bundling step that inlines the code into the manifest, and no way
to avoid hosting.

For Mailflow the hosting is unusually easy, because it's pure static files —
no server, no database, no API. Any static host will do.

## Option A — try it on your own machine

The fastest path. Nothing is hosted publicly; `localhost` is reachable from
your own Outlook because the code runs on the same machine.

Works in Outlook on the web (in a browser on this Mac) and Outlook desktop on
this Mac. It will **not** work on your phone or on another computer.

```bash
npm run dev-server
```

1. Visit <https://localhost:3000/taskpane.html> once and accept the development
   certificate. Outlook silently refuses to load an untrusted origin, and this
   is the single most common reason the pane comes up blank.
2. Go to <https://aka.ms/olksideload>.
3. **My add-ins** → **Add a custom add-in** → **Add from File** → pick
   `manifest.xml` from the repo root.
4. Open a received message. Look for **Delivery timeline** on the ribbon, or
   under the **…** overflow menu.

Leave `npm run dev-server` running the whole time you're testing. Close it and
the pane goes blank, because the code is being served from that process.

**Your mailbox needs the `My Custom Apps` Exchange role** to sideload. It's
enabled by default for most tenants; if the option is missing, that role is
why.

## Option B — deploy to your tenant

Needed for anyone other than you to use it, and for mobile.

### 1. Host `dist/` on GitHub Pages

`.github/workflows/deploy.yml` does this on every push to `main`. It runs the
tests, resolves this repo's Pages URL, builds the manifest against it, strips
the design harness, and publishes.

You need to do two things once:

1. Create the GitHub repo and push to it:

   ```bash
   git remote add origin git@github.com:<you>/mailflow.git
   git push -u origin main
   ```

2. In the repo, go to **Settings → Pages** and set **Source** to
   **GitHub Actions**. Without this the workflow fails at the deploy step.

The workflow prints the manifest URL at the end of a successful run — it'll be
`https://<you>.github.io/mailflow/manifest.xml`.

**Two things to know about Pages:**

- **Publishing from a private repo requires GitHub Pro, Team, or Enterprise.**
  On a free account, Pages only serves public repos. If yours must stay
  private, use one of the alternatives below instead.
- **Whatever you publish is world-readable.** That's fine for Mailflow — the
  code contains no secrets, no credentials, and no mailbox access of its own;
  it only runs inside an authenticated Outlook session. But it does mean the
  source is public, so don't add anything to `dist/` you wouldn't publish.

### Alternatives

Any static HTTPS host works. Set `ADDIN_BASE_URL` to its origin and copy
`dist/` there:

| Host | Notes |
| --- | --- |
| Azure Static Web Apps | Keeps it inside your own subscription; free tier is ample |
| Cloudflare Pages | Free private-source hosting, custom domain included |
| Azure Blob static website | Good if you want it behind your own storage account |
| Any internal IIS/nginx site | Only requirement is HTTPS with a cert Outlook trusts |

### 2. Build against that origin

Handled by CI for Pages. To do it by hand for any other host:

```bash
ADDIN_BASE_URL=https://mailflow.example.com npm run build
```

The build **fails deliberately** if `ADDIN_BASE_URL` is missing, rather than
quietly producing a manifest that points at localhost.

Confirm `https://your-origin/taskpane.html` loads in a normal browser before
going further. If it doesn't load there, it won't load in Outlook.

### 3. Upload to the tenant

You need to be a **Global Administrator** or **Exchange Administrator**.

1. Sign in to the [Microsoft 365 admin center](https://admin.microsoft.com).
2. **Settings** → **Integrated apps**.
3. **Upload custom apps**.
4. Set **App type** to **Office Add-in**. (Not "Teams app" — that's for the
   unified manifest, which Mailflow doesn't use.)
5. Either **Upload manifest file (.xml) from device** → `dist/manifest.xml`,
   or **Provide link to manifest file** → `https://<you>.github.io/mailflow/manifest.xml`.
   The link option is better: future manifest changes then ship with a `git
   push`, with no return trip to the admin center.
6. Assign to **Just me**, **Specific users/groups**, or **Everyone**. Start
   with Just me or a small group.
7. **Deploy**.

The equivalent in PowerShell, if you'd rather script it:

```powershell
New-OrganizationAddIn -ManifestPath 'dist/manifest.xml' -Locale 'en-US' -Members 'you@example.com'
```

### 4. Wait

A green checkmark means the tenant accepted it, not that users can see it.
Propagation to the Outlook ribbon takes **up to 24 hours, sometimes 72**.
Outlook on the web usually picks it up within minutes, so test there first
rather than concluding something is broken.

## Updating it later

**Code changes need no re-upload.** Because Outlook fetches the JavaScript from
your host on every load, redeploying `dist/` is the entire update process.
Users get it on their next task pane open.

**Manifest changes do need a re-upload** — a new ribbon button, a changed name
or icon, a different permission level. In Integrated apps, select the add-in and
use **Update**. Bump `<Version>` in `manifest.xml` when you do; Outlook uses it
to decide whether to refresh its cached copy.

## Removing it

- Sideloaded: the same <https://aka.ms/olksideload> dialog, or `npm stop`.
- Tenant-deployed: Integrated apps → select the add-in → **Remove**.

## Gotchas

- **The `Id` GUID is the add-in's identity.** Don't reuse it across a dev copy
  and a production copy in the same tenant — they'll collide. Generate a fresh
  GUID for a second variant.
- **Mixed content is fatal.** Every URL in the manifest must be HTTPS. Outlook
  will not load an add-in over HTTP, including on localhost.
- **The permission level is visible to your admin at deploy time.** Mailflow
  requests `ReadItem`, the second-lowest of five levels — it can read the open
  message and nothing else. It makes no outbound network calls, so no data
  leaves the client.
- **Caching is aggressive**, especially in classic Outlook on Windows. If a
  change won't appear, [clear the Office cache](https://learn.microsoft.com/office/dev/add-ins/testing/clear-cache).
- **Don't host `preview.html` publicly** if you'd rather not expose the design
  harness. It's harmless — fixture data only, no mailbox access — but it isn't
  referenced by the manifest and can simply be deleted from `dist/` before
  upload.
