import { marked } from "marked";

export function renderTitle(el: HTMLElement, props: Record<string, unknown>): void {
  const text = typeof props.text === "string" ? props.text : "";
  const size = typeof props.size === "string" ? props.size : "h1";
  const validSizes = ["h1", "h2", "h3", "h4", "h5", "h6"];
  const tag = validSizes.includes(size) ? size : "h1";
  const heading = document.createElement(tag);
  heading.textContent = text;
  el.appendChild(heading);
}

export function renderHtml(el: HTMLElement, props: Record<string, unknown>): void {
  if (typeof props.content === "string") {
    el.innerHTML = props.content;
  }
}

export function renderMarkdown(el: HTMLElement, props: Record<string, unknown>): void {
  const content = typeof props.content === "string" ? props.content : "";
  const wrapper = document.createElement("div");
  wrapper.classList.add("casehub-markdown");
  wrapper.innerHTML = marked.parse(content) as string;
  el.appendChild(wrapper);
}
