import type { Component } from "../model/types.js";

export function getSlotChildren(
  component: Component,
  slotName: string,
): readonly Component[] {
  return component.slots?.[slotName] ?? [];
}

export function getSlotNames(component: Component): readonly string[] {
  if (!component.slots) return [];
  return Object.keys(component.slots);
}
