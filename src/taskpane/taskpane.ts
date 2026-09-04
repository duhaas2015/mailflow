import { buildTimeline } from "../parser/received.ts";
import { renderTimeline } from "../render/timeline.ts";
import { textReport } from "../render/report.ts";
import type { Timeline } from "../parser/types.ts";

/** Requirement set that introduced `getAllInternetHeadersAsync`. */
const REQUIRED_MAILBOX_SET = "1.8";

let current: Timeline | undefined;

Office.onReady((info) => {
  if (info.host !== Office.HostType.Outlook) return;

  const copyButton = document.getElementById("copy") as HTMLButtonElement | null;
  copyButton?.addEventListener("click", copyReport);

  // Outlook keeps the task pane open when the user clicks a different message,
  // so without this the pane would keep showing the previous message's hops.
  if (Office.context.requirements.isSetSupported("Mailbox", "1.5")) {
    Office.context.mailbox.addHandlerAsync(Office.EventType.ItemChanged, load);
  }

  load();
});

function load(): void {
  const content = document.getElementById("content");
  const copyButton = document.getElementById("copy") as HTMLButtonElement | null;
  if (!content) return;

  current = undefined;
  if (copyButton) copyButton.disabled = true;

  if (!Office.context.requirements.isSetSupported("Mailbox", REQUIRED_MAILBOX_SET)) {
    showMessage(
      content,
      "This version of Outlook can't read internet headers.",
      `Mailflow needs Outlook with mailbox requirement set ${REQUIRED_MAILBOX_SET} or later. ` +
        "Outlook on the web and current desktop builds support it."
    );
    return;
  }

  const item = Office.context.mailbox.item;

  // The pane also opens on appointments and on drafts, where there is no
  // delivery chain to show yet.
  if (!item || item.itemType !== Office.MailboxEnums.ItemType.Message) {
    showMessage(content, "Open a received message.", "Mailflow reads the delivery path of a message you've received.");
    return;
  }

  showMessage(content, "Reading headers…");

  (item as Office.MessageRead).getAllInternetHeadersAsync((result) => {
    if (result.status !== Office.AsyncResultStatus.Succeeded) {
      showMessage(
        content,
        "Couldn't read the message headers.",
        result.error?.message ?? "Outlook didn't say why."
      );
      return;
    }

    try {
      current = buildTimeline(result.value);
      renderTimeline(current, content);
      if (copyButton) copyButton.disabled = current.hops.length === 0;
    } catch (error) {
      // A parser crash shouldn't leave the pane stuck on "Reading headers…".
      showMessage(
        content,
        "Couldn't make sense of these headers.",
        error instanceof Error ? error.message : String(error)
      );
    }
  });
}

function showMessage(container: HTMLElement, title: string, detail?: string): void {
  container.replaceChildren();

  const empty = document.createElement("div");
  empty.className = "empty";

  const heading = document.createElement("p");
  heading.className = "empty-title";
  heading.textContent = title;
  empty.append(heading);

  if (detail) {
    const body = document.createElement("p");
    body.className = "empty-detail";
    body.textContent = detail;
    empty.append(body);
  }

  container.append(empty);
}

async function copyReport(): Promise<void> {
  if (!current) return;

  const report = textReport(current);
  const button = document.getElementById("copy") as HTMLButtonElement | null;

  try {
    await navigator.clipboard.writeText(report);
  } catch {
    // Some Outlook WebView hosts don't grant the async clipboard API, so fall
    // back to the selection-based copy that predates it.
    const scratch = document.createElement("textarea");
    scratch.value = report;
    scratch.setAttribute("readonly", "");
    scratch.style.position = "fixed";
    scratch.style.opacity = "0";
    document.body.append(scratch);
    scratch.select();
    document.execCommand("copy");
    scratch.remove();
  }

  if (button) {
    const original = button.textContent;
    button.textContent = "Copied";
    setTimeout(() => (button.textContent = original), 1500);
  }
}
