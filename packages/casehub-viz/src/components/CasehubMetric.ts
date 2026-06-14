import type { TypedDataSet } from "@casehub/data/dist/dataset/types.js";
import type { MetricProps } from "@casehub/ui/dist/model/displayer-types.js";
import { CasehubElement } from "../base/CasehubElement.js";
import { cellToRaw } from "../base/cell-extract.js";

const METRIC_CSS = `
:host { display: block; font-family: var(--casehub-font, system-ui, sans-serif); color: var(--casehub-text, #333); }
.card { background: var(--casehub-bg, #fff); border: 1px solid var(--casehub-border, #e0e0e0); border-radius: var(--casehub-radius, 4px); padding: 16px; text-align: center; }
.card .title { font-size: 0.85em; color: var(--casehub-text-muted, #888); margin-bottom: 8px; }
.card .value { font-size: 2em; font-weight: 600; }
.card2 { display: flex; align-items: center; gap: 12px; background: var(--casehub-bg, #fff); border: 1px solid var(--casehub-border, #e0e0e0); border-radius: var(--casehub-radius, 4px); padding: 12px 16px; }
.card2 .value { font-size: 1.5em; font-weight: 600; }
.card2 .title { font-size: 0.85em; color: var(--casehub-text-muted, #888); }
.plain-text .title { font-size: 0.75em; color: var(--casehub-text-muted, #888); }
.plain-text .value { font-size: 1.2em; }
.quota { background: var(--casehub-bg, #fff); border: 1px solid var(--casehub-border, #e0e0e0); border-radius: var(--casehub-radius, 4px); padding: 12px 16px; }
.quota .value { font-size: 1.5em; font-weight: 600; }
.quota .bar { height: 6px; background: var(--casehub-border, #e0e0e0); border-radius: 3px; margin-top: 8px; }
.quota .bar-fill { height: 100%; background: var(--casehub-accent, #5470c6); border-radius: 3px; }
`;

export class CasehubMetric extends CasehubElement<MetricProps> {
  protected override render(
    container: HTMLDivElement,
    props: MetricProps,
    dataset: TypedDataSet,
  ): void {
    container.textContent = "";

    // Style
    const style = document.createElement("style");
    style.textContent = METRIC_CSS;
    container.appendChild(style);

    // Extract value and title
    const raw = cellToRaw(dataset.rows[0]!.cell(dataset.columns[0]!.id));
    const value = raw === null ? "" : String(raw);
    const title = props.title ?? "";

    // HTML template override
    if (props.html?.template) {
      const escaped = value
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;");
      const html = props.html.template.replace(/\$\{value\}/g, escaped);
      const wrapper = document.createElement("div");
      wrapper.innerHTML = html;
      container.appendChild(wrapper);
      return;
    }

    // Render based on subtype
    const subtype = props.subtype ?? "card";

    if (subtype === "card") {
      this.renderCard(container, title, value);
    } else if (subtype === "card2") {
      this.renderCard2(container, title, value);
    } else if (subtype === "plain-text") {
      this.renderPlainText(container, title, value);
    } else if (subtype === "quota") {
      this.renderQuota(container, title, value, dataset);
    }
  }

  private renderCard(container: HTMLDivElement, title: string, value: string): void {
    const card = document.createElement("div");
    card.className = "card";

    const titleEl = document.createElement("div");
    titleEl.className = "title";
    titleEl.textContent = title;
    card.appendChild(titleEl);

    const valueEl = document.createElement("div");
    valueEl.className = "value";
    valueEl.textContent = value;
    card.appendChild(valueEl);

    container.appendChild(card);
  }

  private renderCard2(container: HTMLDivElement, title: string, value: string): void {
    const card2 = document.createElement("div");
    card2.className = "card2";

    const valueEl = document.createElement("div");
    valueEl.className = "value";
    valueEl.textContent = value;
    card2.appendChild(valueEl);

    const titleEl = document.createElement("div");
    titleEl.className = "title";
    titleEl.textContent = title;
    card2.appendChild(titleEl);

    container.appendChild(card2);
  }

  private renderPlainText(container: HTMLDivElement, title: string, value: string): void {
    const plainText = document.createElement("div");
    plainText.className = "plain-text";

    const titleEl = document.createElement("div");
    titleEl.className = "title";
    titleEl.textContent = title;
    plainText.appendChild(titleEl);

    const valueEl = document.createElement("div");
    valueEl.className = "value";
    valueEl.textContent = value;
    plainText.appendChild(valueEl);

    container.appendChild(plainText);
  }

  private renderQuota(
    container: HTMLDivElement,
    title: string,
    value: string,
    dataset: TypedDataSet,
  ): void {
    const quota = document.createElement("div");
    quota.className = "quota";

    const valueEl = document.createElement("div");
    valueEl.className = "value";
    valueEl.textContent = value;
    quota.appendChild(valueEl);

    // Calculate percentage for progress bar
    const numValue = Number(value);
    let percentage = 0;

    if (dataset.columns.length >= 2) {
      // Second column is max
      const maxRaw = cellToRaw(dataset.rows[0]!.cell(dataset.columns[1]!.id));
      const max = maxRaw === null ? 100 : Number(maxRaw);
      percentage = max === 0 ? 0 : (numValue / max) * 100;
    } else {
      // Assume max is 100
      percentage = numValue;
    }

    // Clamp to 0-100
    percentage = Math.max(0, Math.min(100, percentage));

    const bar = document.createElement("div");
    bar.className = "bar";

    const barFill = document.createElement("div");
    barFill.className = "bar-fill";
    barFill.style.width = `${percentage}%`;
    bar.appendChild(barFill);

    quota.appendChild(bar);
    container.appendChild(quota);
  }
}

customElements.define("casehub-metric", CasehubMetric);
