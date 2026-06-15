import type { Component } from "./types.js";
import type {
  GridProps,
  ColumnsProps,
  RowsProps,
  StackProps,
  TabsProps,
  PillsProps,
  SidebarProps,
  TreeProps,
  MenuProps,
  AccordionProps,
  CarouselProps,
  AppGridProps,
  PanelProps,
  HtmlProps,
  MarkdownProps,
  TitleProps,
  LazyPageProps,
} from "./component-props.js";

export interface ComponentTypeRegistry {
  grid: GridProps;
  columns: ColumnsProps;
  rows: RowsProps;
  stack: StackProps;
  tabs: TabsProps;
  pills: PillsProps;
  sidebar: SidebarProps;
  tree: TreeProps;
  menu: MenuProps;
  accordion: AccordionProps;
  carousel: CarouselProps;
  "app-grid": AppGridProps;
  panel: PanelProps;
  html: HtmlProps;
  markdown: MarkdownProps;
  title: TitleProps;
  "lazy-page": LazyPageProps;
}

export function getProps<T extends keyof ComponentTypeRegistry>(
  component: Component,
  type: T,
): ComponentTypeRegistry[T] {
  if (component.type !== type) {
    throw new Error(`Expected ${type}, got ${component.type}`);
  }
  return component.props as unknown as ComponentTypeRegistry[T];
}

// Layout components
export function isGrid(
  c: Component,
): c is Component & { props: GridProps } {
  return c.type === "grid";
}

export function isColumns(
  c: Component,
): c is Component & { props: ColumnsProps } {
  return c.type === "columns";
}

export function isRows(
  c: Component,
): c is Component & { props: RowsProps } {
  return c.type === "rows";
}

export function isStack(
  c: Component,
): c is Component & { props: StackProps } {
  return c.type === "stack";
}

export function isTabs(
  c: Component,
): c is Component & { props: TabsProps } {
  return c.type === "tabs";
}

export function isPills(
  c: Component,
): c is Component & { props: PillsProps } {
  return c.type === "pills";
}

export function isSidebar(
  c: Component,
): c is Component & { props: SidebarProps } {
  return c.type === "sidebar";
}

export function isTree(
  c: Component,
): c is Component & { props: TreeProps } {
  return c.type === "tree";
}

export function isMenu(
  c: Component,
): c is Component & { props: MenuProps } {
  return c.type === "menu";
}

export function isAccordion(
  c: Component,
): c is Component & { props: AccordionProps } {
  return c.type === "accordion";
}

export function isCarousel(
  c: Component,
): c is Component & { props: CarouselProps } {
  return c.type === "carousel";
}

export function isAppGrid(
  c: Component,
): c is Component & { props: AppGridProps } {
  return c.type === "app-grid";
}

// Wrapper components
export function isPanel(
  c: Component,
): c is Component & { props: PanelProps } {
  return c.type === "panel";
}

// Content components
export function isHtml(
  c: Component,
): c is Component & { props: HtmlProps } {
  return c.type === "html";
}

export function isMarkdown(
  c: Component,
): c is Component & { props: MarkdownProps } {
  return c.type === "markdown";
}

export function isTitle(
  c: Component,
): c is Component & { props: TitleProps } {
  return c.type === "title";
}

// Page components
export function isLazyPage(
  c: Component,
): c is Component & { props: LazyPageProps } {
  return c.type === "lazy-page";
}
