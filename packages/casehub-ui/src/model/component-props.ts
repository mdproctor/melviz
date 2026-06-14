export interface GridProps {
  readonly columns: number;
}

export interface ColumnsProps {
  readonly distribution: readonly number[];
}

export interface RowsProps {}
export interface StackProps {}

export interface TabsProps {}
export interface PillsProps {}
export interface SidebarProps {}
export interface TreeProps {}
export interface MenuProps {}
export interface AccordionProps {}
export interface CarouselProps {}
export interface AppGridProps {}

export interface PanelProps {
  readonly title: string;
}

export interface HtmlProps {
  readonly content: string;
}

export interface MarkdownProps {
  readonly content: string;
}

export interface TitleProps {
  readonly text: string;
  readonly size?: string;
}

export interface LazyPageProps {
  readonly name: string;
  readonly href: string;
}

export interface FilterSettings {
  readonly enabled?: boolean;
  readonly notification?: boolean;
  readonly listening?: boolean;
  readonly selfApply?: boolean;
  readonly group?: string;
  readonly drillDown?: DrillDown;
}

export interface DrillDown {
  readonly target: string;
  readonly parameters?: Readonly<Record<string, string>>;
}

export interface RefreshSettings {
  readonly interval?: number;
  readonly showStaleIndicator?: boolean;
}
