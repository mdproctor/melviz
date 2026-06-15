export function generateId(
  parentId: string | undefined,
  slotOrX: string | number | undefined,
  indexOrY: number | undefined,
): string {
  if (parentId === undefined) return "root";
  return `${parentId}::${slotOrX}::${indexOrY}`;
}
