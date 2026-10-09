import type React from 'react';

/**
 * One node of a page template's `content.structure` tree, as authored in the template JSON and
 * walked by the weekly and monthly renderers. `component` is an HTML/SVG tag name (or the name of
 * a React component the renderer knows); `component_type` looks a component up in the renderer's
 * component map instead.
 */
export interface TemplateNode {
  component: string;
  class?: string;
  children?: TemplateNode[];
  component_type?: string;
  component_props?: Record<string, unknown>;
  attributes?: Record<string, any>;
  /** SVG attributes; `data-color` picks one of the page's derived colours. */
  attrs?: Record<string, string>;
  styles?: React.CSSProperties;
  selfClosing?: boolean;
}

/** Components a template can reference by `component_type`. */
export type ComponentMap = Record<string, React.ElementType>;

/** The template tree, typed. `TemplateContent.structure` is deliberately `unknown[]` in the domain. */
export function templateStructure(content: { structure?: unknown[] } | undefined): TemplateNode[] {
  return (content?.structure ?? []) as TemplateNode[];
}
