# Mailflow

An Outlook add-in that turns a message's `Received:` headers into a delivery
timeline: every server the message passed through, and how long it sat at each
one.

When mail arrives late, the answer is almost always sitting in the headers —
one hop with a multi-minute gap while the rest took seconds. Mailflow finds
that hop and names it.

## What it shows

- **End-to-end transit time** and the timestamp at each hop
- **Per-hop delay**, drawn as a bar scaled against the slowest hop
- **The slowest hop**, called out by name in the summary
- **Connection detail** per hop: source IP, protocol, TLS version, MTA software
- **Clock skew**, flagged rather than reported as a negative or zero delay
- **Exchange's own latency measurement**, when present, as a cross-check
- **A copyable plain-text report**, for pasting into a ticket

## How it works

Every MTA that handles a message prepends a `Received:` header recording who it
took the message from, who it is, and when it accepted it. The block therefore
reads newest-first; Mailflow reverses it and differences consecutive timestamps
to get the time spent between hops.

The parsing is fussier than it looks, so it lives in plain modules under
`src/parser/` with tests that run outside Outlook:

- **`headers.ts`** — unfolds continuation lines and splits the block into
  ordered name/value pairs. Also strips RFC 5322 comments, which nest.
- **`date.ts`** — parses RFC 5322 date-times by hand rather than via
  `Date.parse`, because engines disagree on the obsolete forms and an add-in
  runs in whichever WebView the host provides.
- **`received.ts`** — locates the `from`/`by`/`with`/`id`/`for` clauses at
  paren depth zero and slices between them, then assembles the timeline.

Anything that can't be identified is left blank rather than guessed. A wrong
hostname on a delivery timeline is worse than a missing one.

### Caveats worth knowing

- `Received:` headers are **self-reported by each server**. A hop can lie, and
  some gateways rewrite or strip their predecessors.
- **Clock skew is common.** Where a server's clock reads earlier than the one
  before it, Mailflow reports the delay as unknown and flags the hop.
- **Internal-only mail often has no `Received:` headers at all**, because it
  never leaves the Exchange organization.

## Requirements

- Outlook with **mailbox requirement set 1.8** or later — this is what provides
  `getAllInternetHeadersAsync`. Current builds of Outlook on the web, Windows,
  Mac, iOS, and Android all qualify.
- A Microsoft 365 mailbox you can sideload add-ins into.

The add-in requests only **`ReadItem`** permission. It has no backend, makes no
network calls, and never sends message content anywhere — all parsing happens
in the task pane.

## Development

```bash
npm install
```

| Command | What it does |
| --- | --- |
| `npm run dev-server` | Webpack dev server on `https://localhost:3000` |
| `npm start` | Starts the dev server and sideloads the manifest |
| `npm stop` | Stops the dev server and removes the sideloaded add-in |
| `npm test` | Runs the parser tests |
| `npm run typecheck` | Type-checks without emitting |
| `npm run validate` | Validates `manifest.xml` |
| `npm run build` | Production bundle into `dist/` |

### Working on the UI without Outlook

The task pane renders against fixture headers in a plain browser, which is much
faster than re-sideloading to check a layout change:

```bash
npm run build:dev && python3 -m http.server 8080 --directory dist
```

Then open `http://localhost:8080/preview.html` and pick a scenario. Fixtures
live in `src/preview/fixtures.ts`; add your own header blocks there. The
preview is not referenced by the manifest and never ships.

## Sideloading

Outlook add-ins don't use the `wef` folder that Word and Excel use. They're
sideloaded through the Add-Ins for Outlook dialog, which registers the add-in
for your mailbox across every Outlook client including desktop and mobile.

1. Start the dev server so `https://localhost:3000` is serving:

   ```bash
   npm run dev-server
   ```

2. Visit `https://localhost:3000/taskpane.html` once in your browser and accept
   the development certificate. Outlook won't load the pane until the
   certificate is trusted.

3. Go to <https://aka.ms/olksideload>. When the **Add-Ins for Outlook** dialog
   opens, choose **My add-ins** → **Add a custom add-in** → **Add from File**,
   and pick `manifest.xml` from this folder.

4. Open a received message. **Delivery timeline** appears on the ribbon (under
   the **...** menu in some clients).

On macOS, `npm start` cannot complete the sideload for you — run
`npm run dev-server` and use the dialog above. In classic Outlook on Windows a
manually sideloaded add-in can take up to 24 hours to appear, due to caching;
Outlook on the web picks it up immediately.

To remove it, use the same dialog, or run `npm stop` if you sideloaded via
`npm start`.

## Deploying

`manifest.xml` points at `https://localhost:3000` for development. Packaging
for real means hosting `dist/` on an HTTPS origin and building against it:

```bash
ADDIN_BASE_URL=https://mailflow.example.com npm run build
```

See [DEPLOYING.md](DEPLOYING.md) for the full runbook, including uploading to a
Microsoft 365 tenant.
