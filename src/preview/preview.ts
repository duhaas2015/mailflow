import { buildTimeline } from "../parser/received.ts";
import { renderTimeline } from "../render/timeline.ts";
import { textReport } from "../render/report.ts";
import { FIXTURES } from "./fixtures.ts";

/**
 * Design harness. Renders the task pane against fixture headers in a plain
 * browser so the layout can be iterated on without sideloading into Outlook.
 * Never shipped: the manifest doesn't reference this page.
 */
const picker = document.getElementById("fixture") as HTMLSelectElement;
const content = document.getElementById("content") as HTMLElement;
const copy = document.getElementById("copy") as HTMLButtonElement;

FIXTURES.forEach((fixture, i) => {
  const option = document.createElement("option");
  option.value = String(i);
  option.textContent = fixture.name;
  picker.append(option);
});

function show(): void {
  const fixture = FIXTURES[Number(picker.value)];
  if (!fixture) return;

  const timeline = buildTimeline(fixture.headers);
  renderTimeline(timeline, content);
  copy.disabled = false;
  copy.onclick = () => navigator.clipboard.writeText(textReport(timeline));
}

picker.addEventListener("change", show);
show();
