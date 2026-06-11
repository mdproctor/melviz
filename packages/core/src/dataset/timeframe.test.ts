import { describe, it, expect } from "vitest";
import { parseTimeFrame, resolveTimeFrame, resolveInstant } from "./timeframe.js";

describe("parseTimeFrame", () => {
  it("parses 'now till 10second'", () => {
    const tf = parseTimeFrame("now till 10second");
    expect(tf.from).toEqual({ mode: "now" });
    expect(tf.to).toEqual({ mode: "relative", offset: { amount: 10, unit: "SECOND" } });
  });

  it("parses 'begin[year] till now'", () => {
    const tf = parseTimeFrame("begin[year] till now");
    expect(tf.from).toEqual({ mode: "begin", unit: "YEAR" });
    expect(tf.to).toEqual({ mode: "now" });
  });

  it("parses 'begin[year March] -1year till now'", () => {
    const tf = parseTimeFrame("begin[year March] -1year till now");
    expect(tf.from).toEqual({
      mode: "begin",
      unit: "YEAR",
      firstMonthOfYear: 3,
      offset: { amount: -1, unit: "YEAR" },
    });
    expect(tf.to).toEqual({ mode: "now" });
  });

  it("parses 'end[quarter] till 1quarter'", () => {
    const tf = parseTimeFrame("end[quarter] till 1quarter");
    expect(tf.from).toEqual({ mode: "end", unit: "QUARTER" });
    expect(tf.to).toEqual({ mode: "relative", offset: { amount: 1, unit: "QUARTER" } });
  });

  it("parses single instant without 'till' — pairs with now", () => {
    const tf = parseTimeFrame("begin[month]");
    expect(tf.from.mode).toBe("begin");
    expect(tf.to).toEqual({ mode: "now" });
  });

  it("parses 'now +2day'", () => {
    const tf = parseTimeFrame("now +2day");
    expect(tf.from).toEqual({ mode: "now", offset: { amount: 2, unit: "DAY" } });
    expect(tf.to).toEqual({ mode: "now" });
  });

  it("throws on empty string", () => {
    expect(() => parseTimeFrame("")).toThrow();
  });

  it("throws on invalid interval type", () => {
    expect(() => parseTimeFrame("begin[invalid] till now")).toThrow();
  });

  it("parses negative offset '-7day'", () => {
    const tf = parseTimeFrame("-7day");
    expect(tf.from).toEqual({ mode: "relative", offset: { amount: -7, unit: "DAY" } });
    expect(tf.to).toEqual({ mode: "now" });
  });
});

describe("resolveInstant", () => {
  const ref = new Date(Date.UTC(2024, 5, 15, 10, 30, 45, 500));

  it("resolves 'now' to referenceDate", () => {
    const result = resolveInstant({ mode: "now" }, ref);
    expect(result.getTime()).toBe(ref.getTime());
  });

  it("resolves 'now +2day'", () => {
    const result = resolveInstant({ mode: "now", offset: { amount: 2, unit: "DAY" } }, ref);
    expect(result.toISOString()).toBe("2024-06-17T10:30:45.500Z");
  });

  it("resolves begin[year] — truncates to Jan 1", () => {
    const result = resolveInstant({ mode: "begin", unit: "YEAR" }, ref);
    expect(result.toISOString()).toBe("2024-01-01T00:00:00.000Z");
  });

  it("resolves begin[month] — truncates to 1st of month", () => {
    const result = resolveInstant({ mode: "begin", unit: "MONTH" }, ref);
    expect(result.toISOString()).toBe("2024-06-01T00:00:00.000Z");
  });

  it("resolves end[month] — first ms of next month", () => {
    const result = resolveInstant({ mode: "end", unit: "MONTH" }, ref);
    expect(result.toISOString()).toBe("2024-07-01T00:00:00.000Z");
  });

  it("resolves begin[day] — truncates to midnight", () => {
    const result = resolveInstant({ mode: "begin", unit: "DAY" }, ref);
    expect(result.toISOString()).toBe("2024-06-15T00:00:00.000Z");
  });

  it("resolves end[day] — first ms of next day", () => {
    const result = resolveInstant({ mode: "end", unit: "DAY" }, ref);
    expect(result.toISOString()).toBe("2024-06-16T00:00:00.000Z");
  });

  it("resolves begin[hour] — truncates to hour", () => {
    const result = resolveInstant({ mode: "begin", unit: "HOUR" }, ref);
    expect(result.toISOString()).toBe("2024-06-15T10:00:00.000Z");
  });

  it("resolves begin[minute] — truncates to minute", () => {
    const result = resolveInstant({ mode: "begin", unit: "MINUTE" }, ref);
    expect(result.toISOString()).toBe("2024-06-15T10:30:00.000Z");
  });

  it("resolves begin[quarter] — Q2 starts April", () => {
    const result = resolveInstant({ mode: "begin", unit: "QUARTER" }, ref);
    expect(result.toISOString()).toBe("2024-04-01T00:00:00.000Z");
  });

  it("resolves begin[year March] — fiscal year starting March", () => {
    const result = resolveInstant(
      { mode: "begin", unit: "YEAR", firstMonthOfYear: 3 },
      ref,
    );
    expect(result.toISOString()).toBe("2024-03-01T00:00:00.000Z");
  });

  it("resolves begin[year March] when before March — goes to previous year", () => {
    const feb = new Date(Date.UTC(2024, 1, 15));
    const result = resolveInstant(
      { mode: "begin", unit: "YEAR", firstMonthOfYear: 3 },
      feb,
    );
    expect(result.toISOString()).toBe("2023-03-01T00:00:00.000Z");
  });

  it("resolves begin[year] -1year — previous year start", () => {
    const result = resolveInstant(
      { mode: "begin", unit: "YEAR", offset: { amount: -1, unit: "YEAR" } },
      ref,
    );
    expect(result.toISOString()).toBe("2023-01-01T00:00:00.000Z");
  });

  it("resolves relative offset '+5day'", () => {
    const result = resolveInstant(
      { mode: "relative", offset: { amount: 5, unit: "DAY" } },
      ref,
    );
    expect(result.toISOString()).toBe("2024-06-20T10:30:45.500Z");
  });

  it("resolves relative offset '-2month'", () => {
    const result = resolveInstant(
      { mode: "relative", offset: { amount: -2, unit: "MONTH" } },
      ref,
    );
    expect(result.toISOString()).toBe("2024-04-15T10:30:45.500Z");
  });

  it("offset +1month from Jan 31 — overflows to March 3 (JS Date overflow; Java Calendar clamps to Feb 28)", () => {
    const jan31 = new Date(Date.UTC(2023, 0, 31));
    const result = resolveInstant(
      { mode: "relative", offset: { amount: 1, unit: "MONTH" } },
      jan31,
    );
    expect(result.getUTCMonth()).toBe(2);
    expect(result.getUTCDate()).toBe(3);
  });

  it("offset +1week adds 7 days", () => {
    const result = resolveInstant(
      { mode: "relative", offset: { amount: 1, unit: "WEEK" } },
      ref,
    );
    expect(result.toISOString()).toBe("2024-06-22T10:30:45.500Z");
  });
});

describe("resolveTimeFrame", () => {
  const ref = new Date(Date.UTC(2024, 5, 15, 10, 30, 0));

  it("resolves 'begin[year] till now'", () => {
    const tf = parseTimeFrame("begin[year] till now");
    const { from, to } = resolveTimeFrame(tf, ref);
    expect(from.toISOString()).toBe("2024-01-01T00:00:00.000Z");
    expect(to.toISOString()).toBe("2024-06-15T10:30:00.000Z");
  });

  it("resolves relative 'to' using resolved 'from' as start time", () => {
    const tf = parseTimeFrame("begin[month] till 10day");
    const { from, to } = resolveTimeFrame(tf, ref);
    expect(from.toISOString()).toBe("2024-06-01T00:00:00.000Z");
    expect(to.toISOString()).toBe("2024-06-11T00:00:00.000Z");
  });

  it("swaps from/to when from > to", () => {
    const tf = parseTimeFrame("end[year] till begin[year]");
    const { from, to } = resolveTimeFrame(tf, ref);
    expect(from < to).toBe(true);
  });

  it("single instant without 'till' — pairs with now, orders correctly", () => {
    const tf = parseTimeFrame("begin[month]");
    const { from, to } = resolveTimeFrame(tf, ref);
    expect(from.toISOString()).toBe("2024-06-01T00:00:00.000Z");
    expect(to.toISOString()).toBe("2024-06-15T10:30:00.000Z");
  });

  it("zero-width range is valid (equal instants)", () => {
    const tf = parseTimeFrame("now till now");
    const { from, to } = resolveTimeFrame(tf, ref);
    expect(from.getTime()).toBe(to.getTime());
  });
});
