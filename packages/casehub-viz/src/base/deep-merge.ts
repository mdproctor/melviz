export function deepMerge<T extends Record<string, unknown>>(
  base: T,
  override: Record<string, unknown>,
): T {
  const result = { ...base } as Record<string, unknown>;

  for (const key of Object.keys(override)) {
    const baseVal = result[key];
    const overrideVal = override[key];

    if (
      Array.isArray(baseVal) &&
      !Array.isArray(overrideVal) &&
      overrideVal !== null &&
      typeof overrideVal === "object"
    ) {
      // Object override applied to each element of array base
      // (e.g., series: {barCategoryGap: "1%"} applied to series: [{type: "bar"}, ...])
      result[key] = baseVal.map((item) => {
        if (item !== null && typeof item === "object" && !Array.isArray(item)) {
          return deepMerge(item as Record<string, unknown>, overrideVal as Record<string, unknown>);
        }
        return item;
      });
    } else if (
      Array.isArray(overrideVal) &&
      Array.isArray(baseVal)
    ) {
      // Merge arrays element-by-element: override properties are merged into
      // the corresponding base element. Extra override elements are appended.
      const merged = baseVal.map((baseItem, i) => {
        if (i >= overrideVal.length) return baseItem;
        const overrideItem = overrideVal[i];
        if (
          baseItem !== null && typeof baseItem === "object" && !Array.isArray(baseItem) &&
          overrideItem !== null && typeof overrideItem === "object" && !Array.isArray(overrideItem)
        ) {
          return deepMerge(baseItem as Record<string, unknown>, overrideItem as Record<string, unknown>);
        }
        return overrideItem;
      });
      // Append extra override elements beyond base length
      for (let i = baseVal.length; i < overrideVal.length; i++) {
        merged.push(overrideVal[i]);
      }
      result[key] = merged;
    } else if (
      overrideVal !== null &&
      overrideVal !== undefined &&
      typeof overrideVal === "object" &&
      !Array.isArray(overrideVal) &&
      baseVal !== null &&
      baseVal !== undefined &&
      typeof baseVal === "object" &&
      !Array.isArray(baseVal)
    ) {
      result[key] = deepMerge(
        baseVal as Record<string, unknown>,
        overrideVal as Record<string, unknown>,
      );
    } else {
      result[key] = overrideVal;
    }
  }

  return result as T;
}
