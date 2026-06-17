# Lazy Tab Rendering Design

**Issue:** #32 — Tab navigation renders all pages, causes duplicate components and broken cross-filtering
**Date:** 2026-06-17
**Status:** Approved (revised)

## Problem

Interactive one-at-a-time containers (tabs, pills, sidebar, carousel, stack) render ALL slot children into the DOM on initial render, hiding inactive slots with `display: none`. This causes:

1. **Registry corruption:** `registry.set(componentId, entry)` overwrites — the last-registered instance (typically hidden) wins. Filter handlers update the hidden instance; the visible instance stays stale.
2. **Resource waste:** N copies of every component in the DOM (6x for Kitchensink).
3. **Broken cross-filtering:** selector filter updates propagate to the hidden instance, not the visible one.

### Root cause trace

```
renderNode (render.ts:95-113)
  → creates slot containers for ALL slots
  → recurses into ALL slot children (onNode fires for each)
  → wireInteractivity hides inactive slots with display:none (too late)

createActivationCallback (activation.ts:53)
  → registry.set(componentId, entry) for every data component
  → last registration wins — points to hidden instance

casehub-filter handler (site.ts:128)
  → registry.get(componentId) → gets hidden instance
  → updates hidden instance, visible instance unchanged
```

## Design

### Approach: Lazy render with slot-content factory

Split rendering of one-at-a-time containers into two phases:
1. `renderNode` creates empty slot container divs but does NOT recurse into children.
2. `wireInteractivity` receives a `renderSlot` callback and the slot children data. It renders the active (first) slot immediately. On tab change, it tears down the old slot and renders the new one.

### Lazy vs eager types

| Rendering | Types | Rationale |
|-----------|-------|-----------|
| **Lazy** | `tabs`, `pills`, `sidebar`, `carousel`, `stack` | One-at-a-time — only active slot needs content |
| **Eager** | `accordion`, `rows`, `columns`, `panel`, `grid`, `app-grid` | All children visible (accordion: all expanded by default) |

`LAZY_TYPES` is a `Set` defined in `render.ts` — its only consumer. This is a subset of `INTERACTIVE_TYPES` in `navigation.ts` (runtime package). The relationship: all lazy types are interactive types; accordion is interactive but not lazy because all sections start expanded. These sets live in different packages with different concerns (rendering vs navigation), so unification is not appropriate, but this relationship must be documented as a comment in render.ts.

### Renderer changes (render.ts)

The slot-rendering block in `renderNode` splits by type:

```
if (component has slots) {
  slotNames = getSlotNames(component)
  panels = Map<string, HTMLElement>   // slot container divs
  isLazy = LAZY_TYPES.has(component.type)

  if (!isLazy) {
    // Eager: create divs, recurse into children (unchanged)
  } else {
    // Lazy: create empty slot divs, no recursion
  }

  wireInteractivity(el, type, slotNames, panels, doc,
    isLazy ? { slotChildren: component.slots, renderSlot: closure-over-renderNode-args } : undefined
  )
}
```

The `renderSlot` callback is a closure capturing `id`, `permissions`, `doc`, and `onNode` from `renderNode`'s scope. Lazily-rendered children go through the exact same activation pipeline as eagerly-rendered ones.

### Slot swap module (new file: slot-swap.ts)

Consolidates slot-swap lifecycle concerns: the swap function registry and the slot-change event dispatch. Both `interactive.ts` and `activate-slot.ts` currently have their own `dispatchSlotChange` implementations (interactive.ts:28-38, activate-slot.ts:30-40) — pre-existing duplication that this spec resolves.

```typescript
export type SwapFn = (slotName: string) => void;

export const slotSwapRegistry = new WeakMap<HTMLElement, SwapFn>();

export function dispatchSlotChange(container: HTMLElement, slotName: string): void {
  container.dispatchEvent(
    new CustomEvent("casehub-slot-change", {
      bubbles: true,
      composed: true,
      detail: {
        activeSlot: slotName,
        containerId: container.dataset.componentId,
      },
    }),
  );
}
```

Three consumers import from this module:
- `interactive.ts` — registers swap functions, calls `dispatchSlotChange` from wire functions
- `activate-slot.ts` — reads swap functions, calls `dispatchSlotChange` for accordion fallback
- (Both delete their local `dispatchSlotChange` implementations)

### Interactivity changes (interactive.ts)

New optional config type:

```typescript
interface LazyConfig {
  slotChildren: Readonly<Record<string, readonly Component[]>>
  renderSlot: (parent: HTMLElement, children: readonly Component[], slotName: string) => void
}
```

Signature: `wireInteractivity(container, type, slotNames, panels, doc, lazy?)`

#### Swap function as single owner

Each wire function (`wireTabs`, `wireSidebar`, `wireCarousel`, and the stack path) builds a swap function that is the single owner of the slot transition. The swap function guards `if (slotName === currentSlot) return` — re-clicking the active tab is a no-op, not a destructive re-render. The swap function manages:
- Which slot is currently active (state tracking)
- DOM teardown of the old slot (`innerHTML = ""`)
- Lazy rendering of the new slot (`lazy.renderSlot`)
- UI chrome state (button `data-active` for tabs/pills/sidebar, `currentIndex` for carousel)
- Event dispatch (`dispatchSlotChange`)

Click handlers delegate to the swap function — they extract the target slot name from the event and call `swap(slotName)`. They do not duplicate swap logic. `activateSlot` also calls the same swap function via the swap registry. Both paths converge on the same code.

Each wire function registers its swap function in `slotSwapRegistry` after construction.

#### Per-type notes

**tabs / pills / sidebar:** The swap function owns button `data-active` state. The click handler reads `target.dataset.slot` and calls `swap(slotName)`.

**carousel:** The swap function owns `currentIndex`. Prev/next handlers compute the new index and call `swap(slotNames[newIndex])`.

**stack:** The simplest lazy type — no click handlers, no navigation chrome. Initial render calls `renderSlot` for slot 0 and registers the swap function. The only way to switch stack slots is programmatic via `activateSlot`.

**accordion:** Unchanged. Never receives `LazyConfig`. Continues to use its own expand/collapse toggle logic with eager rendering. Imports `dispatchSlotChange` from `slot-swap.ts` (replacing its local dispatch).

### activate-slot.ts changes

Before the existing display-toggle logic, check the swap registry:

```typescript
import { slotSwapRegistry, dispatchSlotChange } from "./slot-swap.js";

const swap = slotSwapRegistry.get(container);
if (swap) {
  swap(slotName);
  return true;
}
// Fall through to display-toggle for accordion / non-lazy containers
// (accordion fallback uses dispatchSlotChange from slot-swap.ts)
```

This means `site.navigate()` automatically triggers lazy rendering — no changes needed in site.ts's navigate method.

### Registry cleanup (site.ts)

In the `casehub-slot-change` handler, after updating `activeSlots` and `currentPage`:

```typescript
for (const [id, entry] of registry) {
  if (!entry.element.isConnected) {
    registry.delete(id);
  }
}
```

`element.isConnected` is O(1). The registry is small (tens of entries). The eviction runs after `renderSlot` completes (new components already registered), so there's no window where a valid entry is missing.

#### Async resolution safety

Data-pipeline.ts handles data requests asynchronously — when a `connectedCallback` fires during slot rendering, the pipeline may start an async dataset resolution. If a slot switch occurs while a resolution is in flight, the `.then()` closure (data-pipeline.ts:103-106) holds a reference to the entry captured at request time. After eviction, the entry is no longer in the registry but the closure still holds it. `pushData` then sets `target.dataSet` on the viz element — a no-op property assignment on a disconnected element. This is harmless. No cancellation mechanism is needed.

### Event sequencing

On tab switch, the sequence is:
1. Old slot innerHTML cleared — old DOM destroyed
2. `renderSlot` called for new slot — new DOM created, `onNode` fires, `registry.set` registers new entries
3. `dispatchSlotChange` fires — runtime handler runs, evicts disconnected entries, updates `currentPage`
4. Filter/data-request handlers now see only connected (visible) components

### Design trade-offs

#### Fresh re-render on tab revisit

Revisiting a previously-visited slot re-renders from scratch rather than reattaching cached DOM. This loses ephemeral component state (scroll position in tables, user-adjusted sort order, expanded sub-sections within a tab). This is acceptable because: (a) filter state persists in `FilterState` and is reapplied on data request, (b) datasets are cached in `DataSetManager` so re-renders resolve instantly, (c) maintaining detached DOM or shadow caches adds architectural complexity with no user-facing benefit on this platform.

#### Initial deep-link slot-0 churn

On initial load with a URL like `#/page/Sales/Revenue`, each lazy container in the navigation path renders slot 0 and then immediately swaps to the target slot. For a path of depth N, this creates N wasted render-then-destroy cycles. `DataSetManager` caching makes the data-request cost negligible, but the DOM churn scales with path depth. If this becomes measurable, a follow-up could pass the initial target path to `wireInteractivity` to skip slot-0 rendering when the URL specifies a different slot.

### Impact on existing functionality

| Subsystem | Impact |
|-----------|--------|
| `activation.ts` | None — `onNode` callback works unchanged |
| `data-pipeline.ts` | None — async resolutions resolve harmlessly against disconnected elements |
| `cross-filter.ts` | None — filter state unchanged |
| `navigation.ts` | None — page path computation unchanged |
| `registry.ts` | None — type unchanged |
| `site.navigate()` | None — delegates to `activateSlot` which now triggers lazy rendering |
| URL deep-linking | None — `navigate()` → `activateSlot` → lazy render (slot-0 churn, see trade-offs) |
| `dispose()` | None — `registry.clear()` + `target.innerHTML = ""` still cleans up everything |

## Testing strategy

### @casehub/component unit tests

**render.test.ts:**
- Lazy types: only first slot's children rendered. Other slot containers exist but are empty.
- Eager types: all slot children rendered as before.
- `onNode` fires only for active slot's children on initial render.

**interactive.test.ts:**
- Tab click delegates to swap function — old slot cleared, new slot rendered.
- Switching back to previously-visited slot re-renders fresh.
- Sidebar lazy swap with grid layout — slot clearing and re-rendering preserves grid structure.
- Carousel prev/next triggers lazy swap via swap function, `currentIndex` tracks correctly.
- Stack renders only first slot, swap function registered but no click handlers wired.
- Accordion unchanged — all sections eager, no `LazyConfig`.
- Swap function is the single code path for both click and programmatic activation.

**activate-slot.test.ts:**
- Container with registered swap function: swap called instead of display toggle.
- Container without swap function: falls through to existing behavior (accordion).
- `dispatchSlotChange` imported from `slot-swap.ts` — no local dispatch implementation.

**slot-swap.test.ts:**
- `dispatchSlotChange` emits correct `CustomEvent` with `activeSlot` and `containerId`.
- `slotSwapRegistry` stores and retrieves swap functions keyed by element.
- WeakMap behavior: no retention after element is GC-eligible (structural, not runtime-testable — document only).

### @casehub/runtime unit tests

**site.test.ts:**
- Registry eviction: after tab switch, disconnected entries removed.
- Filter propagation after tab switch: filter only hits visible (connected) components.
- `navigate()` triggers lazy rendering through `activateSlot`.
- Data-request fires for lazily-rendered components (viz element `connectedCallback` dispatches during `renderSlot`).

## Files changed

| File | Package | Change |
|------|---------|--------|
| `renderer/slot-swap.ts` | `@casehub/component` | **New** — `SwapFn`, `slotSwapRegistry` WeakMap, `dispatchSlotChange` |
| `renderer/render.ts` | `@casehub/component` | `LAZY_TYPES` set, lazy/eager split in slot rendering |
| `renderer/interactive.ts` | `@casehub/component` | Accept `LazyConfig`, build swap function per wire-type, register in swap registry, click handlers delegate to swap function, delete local `dispatchSlotChange` |
| `renderer/activate-slot.ts` | `@casehub/component` | Check swap registry before display-toggle, import `dispatchSlotChange` from `slot-swap.ts`, delete local dispatch |
| `site.ts` | `@casehub/runtime` | Evict disconnected registry entries in `casehub-slot-change` handler |
| `renderer/render.test.ts` | `@casehub/component` | Lazy/eager rendering assertions |
| `renderer/interactive.test.ts` | `@casehub/component` | Swap function delegation, sidebar lazy, carousel index, stack, re-render |
| `renderer/activate-slot.test.ts` | `@casehub/component` | Swap registry integration, accordion fallback |
| `renderer/slot-swap.test.ts` | `@casehub/component` | `dispatchSlotChange` and registry tests |
| `site.test.ts` | `@casehub/runtime` | Registry eviction, filter, navigate, data-request tests |

**No changes to:** `activation.ts`, `data-pipeline.ts`, `cross-filter.ts`, `navigation.ts`, `registry.ts`, `layout.ts`, `slots.ts`

## Out of scope

- Type-safety audit of existing codebase (#34)
- Deep-link slot-0 optimization (pass initial path to `wireInteractivity`)
- Accordion lazy-on-collapse (all sections start expanded — no benefit)
- Performance benchmarking of lazy vs eager rendering
