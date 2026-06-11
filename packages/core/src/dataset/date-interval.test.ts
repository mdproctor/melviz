import { describe, it, expect } from "vitest";
import { truncateToInterval, advanceByInterval } from "./date-interval.js";

// Helper for readable test dates (1-based month)
function utc(
  y: number,
  m: number,
  d = 1,
  h = 0,
  min = 0,
  s = 0,
  ms = 0
): Date {
  return new Date(Date.UTC(y, m - 1, d, h, min, s, ms));
}

describe("truncateToInterval", () => {
  it("should not mutate input date", () => {
    const input = utc(2024, 6, 15, 10, 30, 45, 123);
    const original = input.getTime();
    truncateToInterval(input, "DAY");
    expect(input.getTime()).toBe(original);
  });

  describe("MILLISECOND", () => {
    it("should return the same date (no-op)", () => {
      const input = utc(2024, 6, 15, 10, 30, 45, 123);
      const result = truncateToInterval(input, "MILLISECOND");
      expect(result.getTime()).toBe(input.getTime());
    });
  });

  describe("HUNDRETH", () => {
    it("should floor to 10ms", () => {
      expect(truncateToInterval(utc(2024, 6, 15, 10, 30, 45, 123), "HUNDRETH")).toEqual(
        utc(2024, 6, 15, 10, 30, 45, 120)
      );
      expect(truncateToInterval(utc(2024, 6, 15, 10, 30, 45, 129), "HUNDRETH")).toEqual(
        utc(2024, 6, 15, 10, 30, 45, 120)
      );
    });
  });

  describe("TENTH", () => {
    it("should floor to 100ms", () => {
      expect(truncateToInterval(utc(2024, 6, 15, 10, 30, 45, 123), "TENTH")).toEqual(
        utc(2024, 6, 15, 10, 30, 45, 100)
      );
      expect(truncateToInterval(utc(2024, 6, 15, 10, 30, 45, 987), "TENTH")).toEqual(
        utc(2024, 6, 15, 10, 30, 45, 900)
      );
    });
  });

  describe("SECOND", () => {
    it("should zero milliseconds", () => {
      expect(truncateToInterval(utc(2024, 6, 15, 10, 30, 45, 123), "SECOND")).toEqual(
        utc(2024, 6, 15, 10, 30, 45, 0)
      );
    });
  });

  describe("MINUTE", () => {
    it("should zero seconds and milliseconds", () => {
      expect(truncateToInterval(utc(2024, 6, 15, 10, 30, 45, 123), "MINUTE")).toEqual(
        utc(2024, 6, 15, 10, 30, 0, 0)
      );
    });
  });

  describe("HOUR", () => {
    it("should zero minutes, seconds, and milliseconds", () => {
      expect(truncateToInterval(utc(2024, 6, 15, 10, 30, 45, 123), "HOUR")).toEqual(
        utc(2024, 6, 15, 10, 0, 0, 0)
      );
    });
  });

  describe("DAY", () => {
    it("should zero time components", () => {
      expect(truncateToInterval(utc(2024, 6, 15, 10, 30, 45, 123), "DAY")).toEqual(
        utc(2024, 6, 15, 0, 0, 0, 0)
      );
    });
  });

  describe("DAY_OF_WEEK", () => {
    it("should zero time components (same as DAY)", () => {
      expect(truncateToInterval(utc(2024, 6, 15, 10, 30, 45, 123), "DAY_OF_WEEK")).toEqual(
        utc(2024, 6, 15, 0, 0, 0, 0)
      );
    });
  });

  describe("WEEK", () => {
    it("should zero time components (same as DAY)", () => {
      expect(truncateToInterval(utc(2024, 6, 15, 10, 30, 45, 123), "WEEK")).toEqual(
        utc(2024, 6, 15, 0, 0, 0, 0)
      );
    });
  });

  describe("MONTH", () => {
    it("should truncate to first day of month at midnight", () => {
      expect(truncateToInterval(utc(2024, 6, 15, 10, 30, 45, 123), "MONTH")).toEqual(
        utc(2024, 6, 1, 0, 0, 0, 0)
      );
    });
  });

  describe("QUARTER", () => {
    it("should truncate to first day of quarter (calendar year)", () => {
      expect(truncateToInterval(utc(2024, 1, 15), "QUARTER")).toEqual(utc(2024, 1, 1));
      expect(truncateToInterval(utc(2024, 2, 28), "QUARTER")).toEqual(utc(2024, 1, 1));
      expect(truncateToInterval(utc(2024, 3, 31), "QUARTER")).toEqual(utc(2024, 1, 1));
      expect(truncateToInterval(utc(2024, 4, 15), "QUARTER")).toEqual(utc(2024, 4, 1));
      expect(truncateToInterval(utc(2024, 5, 20), "QUARTER")).toEqual(utc(2024, 4, 1));
      expect(truncateToInterval(utc(2024, 6, 30), "QUARTER")).toEqual(utc(2024, 4, 1));
      expect(truncateToInterval(utc(2024, 7, 10), "QUARTER")).toEqual(utc(2024, 7, 1));
      expect(truncateToInterval(utc(2024, 10, 25), "QUARTER")).toEqual(utc(2024, 10, 1));
    });

    it("should support fiscal year quarter (firstMonthOfYear: 4)", () => {
      // Fiscal year starts April 1
      expect(truncateToInterval(utc(2024, 1, 15), "QUARTER", { firstMonthOfYear: 4 })).toEqual(
        utc(2024, 1, 1)
      ); // Q4 of FY23
      expect(truncateToInterval(utc(2024, 3, 31), "QUARTER", { firstMonthOfYear: 4 })).toEqual(
        utc(2024, 1, 1)
      );
      expect(truncateToInterval(utc(2024, 4, 15), "QUARTER", { firstMonthOfYear: 4 })).toEqual(
        utc(2024, 4, 1)
      ); // Q1 of FY24
      expect(truncateToInterval(utc(2024, 6, 30), "QUARTER", { firstMonthOfYear: 4 })).toEqual(
        utc(2024, 4, 1)
      );
      expect(truncateToInterval(utc(2024, 7, 10), "QUARTER", { firstMonthOfYear: 4 })).toEqual(
        utc(2024, 7, 1)
      ); // Q2 of FY24
      expect(truncateToInterval(utc(2024, 10, 1), "QUARTER", { firstMonthOfYear: 4 })).toEqual(
        utc(2024, 10, 1)
      ); // Q3 of FY24
    });
  });

  describe("YEAR", () => {
    it("should truncate to Jan 1 midnight (calendar year)", () => {
      expect(truncateToInterval(utc(2024, 6, 15, 10, 30, 45, 123), "YEAR")).toEqual(
        utc(2024, 1, 1, 0, 0, 0, 0)
      );
      expect(truncateToInterval(utc(2024, 12, 31, 23, 59, 59, 999), "YEAR")).toEqual(
        utc(2024, 1, 1, 0, 0, 0, 0)
      );
    });

    it("should support fiscal year (firstMonthOfYear: 4)", () => {
      // July 2024 → FY starting April 1, 2024
      expect(truncateToInterval(utc(2024, 7, 15), "YEAR", { firstMonthOfYear: 4 })).toEqual(
        utc(2024, 4, 1)
      );
      // Feb 2024 → FY starting April 1, 2023
      expect(truncateToInterval(utc(2024, 2, 15), "YEAR", { firstMonthOfYear: 4 })).toEqual(
        utc(2023, 4, 1)
      );
      // April 1, 2024 → exactly start of FY
      expect(truncateToInterval(utc(2024, 4, 1), "YEAR", { firstMonthOfYear: 4 })).toEqual(
        utc(2024, 4, 1)
      );
      // March 31, 2024 → FY starting April 1, 2023
      expect(truncateToInterval(utc(2024, 3, 31), "YEAR", { firstMonthOfYear: 4 })).toEqual(
        utc(2023, 4, 1)
      );
    });
  });

  describe("DECADE", () => {
    it("should truncate to start of decade", () => {
      expect(truncateToInterval(utc(2024, 6, 15), "DECADE")).toEqual(utc(2020, 1, 1));
      expect(truncateToInterval(utc(2019, 12, 31), "DECADE")).toEqual(utc(2010, 1, 1));
      expect(truncateToInterval(utc(2020, 1, 1), "DECADE")).toEqual(utc(2020, 1, 1));
    });
  });

  describe("CENTURY", () => {
    it("should truncate to start of century", () => {
      expect(truncateToInterval(utc(2024, 6, 15), "CENTURY")).toEqual(utc(2000, 1, 1));
      expect(truncateToInterval(utc(1999, 12, 31), "CENTURY")).toEqual(utc(1900, 1, 1));
      expect(truncateToInterval(utc(2000, 1, 1), "CENTURY")).toEqual(utc(2000, 1, 1));
    });
  });

  describe("MILLENIUM", () => {
    it("should truncate to start of millennium", () => {
      expect(truncateToInterval(utc(2024, 6, 15), "MILLENIUM")).toEqual(utc(2000, 1, 1));
      expect(truncateToInterval(utc(1999, 12, 31), "MILLENIUM")).toEqual(utc(1000, 1, 1));
      expect(truncateToInterval(utc(2000, 1, 1), "MILLENIUM")).toEqual(utc(2000, 1, 1));
    });
  });
});

describe("advanceByInterval", () => {
  it("should not mutate input date", () => {
    const input = utc(2024, 6, 15, 10, 30, 45, 123);
    const original = input.getTime();
    advanceByInterval(input, "DAY", 1);
    expect(input.getTime()).toBe(original);
  });

  describe("MILLISECOND", () => {
    it("should advance by 1ms", () => {
      expect(advanceByInterval(utc(2024, 6, 15, 10, 30, 45, 123), "MILLISECOND", 1)).toEqual(
        utc(2024, 6, 15, 10, 30, 45, 124)
      );
      expect(advanceByInterval(utc(2024, 6, 15, 10, 30, 45, 123), "MILLISECOND", 5)).toEqual(
        utc(2024, 6, 15, 10, 30, 45, 128)
      );
    });

    it("should handle negative count", () => {
      expect(advanceByInterval(utc(2024, 6, 15, 10, 30, 45, 123), "MILLISECOND", -23)).toEqual(
        utc(2024, 6, 15, 10, 30, 45, 100)
      );
    });
  });

  describe("HUNDRETH", () => {
    it("should advance by 10ms", () => {
      expect(advanceByInterval(utc(2024, 6, 15, 10, 30, 45, 100), "HUNDRETH", 1)).toEqual(
        utc(2024, 6, 15, 10, 30, 45, 110)
      );
      expect(advanceByInterval(utc(2024, 6, 15, 10, 30, 45, 100), "HUNDRETH", 5)).toEqual(
        utc(2024, 6, 15, 10, 30, 45, 150)
      );
    });
  });

  describe("TENTH", () => {
    it("should advance by 100ms", () => {
      expect(advanceByInterval(utc(2024, 6, 15, 10, 30, 45, 100), "TENTH", 1)).toEqual(
        utc(2024, 6, 15, 10, 30, 45, 200)
      );
      expect(advanceByInterval(utc(2024, 6, 15, 10, 30, 45, 100), "TENTH", 5)).toEqual(
        utc(2024, 6, 15, 10, 30, 45, 600)
      );
    });
  });

  describe("SECOND", () => {
    it("should advance by 1 second", () => {
      expect(advanceByInterval(utc(2024, 6, 15, 10, 30, 45), "SECOND", 1)).toEqual(
        utc(2024, 6, 15, 10, 30, 46)
      );
      expect(advanceByInterval(utc(2024, 6, 15, 10, 30, 45), "SECOND", 20)).toEqual(
        utc(2024, 6, 15, 10, 31, 5)
      );
    });
  });

  describe("MINUTE", () => {
    it("should advance by 1 minute", () => {
      expect(advanceByInterval(utc(2024, 6, 15, 10, 30), "MINUTE", 1)).toEqual(
        utc(2024, 6, 15, 10, 31)
      );
      expect(advanceByInterval(utc(2024, 6, 15, 10, 30), "MINUTE", 45)).toEqual(
        utc(2024, 6, 15, 11, 15)
      );
    });
  });

  describe("HOUR", () => {
    it("should advance by 1 hour", () => {
      expect(advanceByInterval(utc(2024, 6, 15, 10), "HOUR", 1)).toEqual(utc(2024, 6, 15, 11));
      expect(advanceByInterval(utc(2024, 6, 15, 10), "HOUR", 15)).toEqual(utc(2024, 6, 16, 1));
    });
  });

  describe("DAY", () => {
    it("should advance by 1 day", () => {
      expect(advanceByInterval(utc(2024, 6, 15), "DAY", 1)).toEqual(utc(2024, 6, 16));
      expect(advanceByInterval(utc(2024, 6, 30), "DAY", 1)).toEqual(utc(2024, 7, 1));
      expect(advanceByInterval(utc(2024, 12, 31), "DAY", 1)).toEqual(utc(2025, 1, 1));
    });
  });

  describe("DAY_OF_WEEK", () => {
    it("should advance by 1 day (same as DAY)", () => {
      expect(advanceByInterval(utc(2024, 6, 15), "DAY_OF_WEEK", 1)).toEqual(utc(2024, 6, 16));
      expect(advanceByInterval(utc(2024, 6, 30), "DAY_OF_WEEK", 1)).toEqual(utc(2024, 7, 1));
    });
  });

  describe("WEEK", () => {
    it("should advance by 7 days", () => {
      expect(advanceByInterval(utc(2024, 6, 15), "WEEK", 1)).toEqual(utc(2024, 6, 22));
      expect(advanceByInterval(utc(2024, 6, 28), "WEEK", 1)).toEqual(utc(2024, 7, 5));
    });
  });

  describe("MONTH", () => {
    it("should advance by 1 month", () => {
      expect(advanceByInterval(utc(2024, 6, 15), "MONTH", 1)).toEqual(utc(2024, 7, 15));
      expect(advanceByInterval(utc(2024, 12, 15), "MONTH", 1)).toEqual(utc(2025, 1, 15));
    });

    it("should handle month overflow (Jan 31 + 1 month)", () => {
      // Jan 31 + 1 month = March 2 (2024 is a leap year, Feb has 29 days, 31 - 29 = 2)
      expect(advanceByInterval(utc(2024, 1, 31), "MONTH", 1)).toEqual(utc(2024, 3, 2));
      // Jan 31, 2023 + 1 month = March 3 (2023 is not a leap year, Feb has 28 days, 31 - 28 = 3)
      expect(advanceByInterval(utc(2023, 1, 31), "MONTH", 1)).toEqual(utc(2023, 3, 3));
    });

    it("should handle negative count", () => {
      expect(advanceByInterval(utc(2024, 6, 15), "MONTH", -2)).toEqual(utc(2024, 4, 15));
      expect(advanceByInterval(utc(2024, 1, 15), "MONTH", -1)).toEqual(utc(2023, 12, 15));
    });
  });

  describe("QUARTER", () => {
    it("should advance by 3 months", () => {
      expect(advanceByInterval(utc(2024, 1, 15), "QUARTER", 1)).toEqual(utc(2024, 4, 15));
      expect(advanceByInterval(utc(2024, 10, 15), "QUARTER", 1)).toEqual(utc(2025, 1, 15));
    });

    it("should handle negative count", () => {
      expect(advanceByInterval(utc(2024, 6, 15), "QUARTER", -1)).toEqual(utc(2024, 3, 15));
    });
  });

  describe("YEAR", () => {
    it("should advance by 1 year", () => {
      expect(advanceByInterval(utc(2024, 6, 15), "YEAR", 1)).toEqual(utc(2025, 6, 15));
      expect(advanceByInterval(utc(2024, 2, 29), "YEAR", 1)).toEqual(utc(2025, 3, 1)); // leap year overflow (2025 has 28 days in Feb, 29 - 28 = 1)
    });

    it("should handle negative count", () => {
      expect(advanceByInterval(utc(2024, 6, 15), "YEAR", -2)).toEqual(utc(2022, 6, 15));
    });
  });

  describe("DECADE", () => {
    it("should advance by 10 years", () => {
      expect(advanceByInterval(utc(2024, 6, 15), "DECADE", 1)).toEqual(utc(2034, 6, 15));
      expect(advanceByInterval(utc(2024, 6, 15), "DECADE", -1)).toEqual(utc(2014, 6, 15));
    });
  });

  describe("CENTURY", () => {
    it("should advance by 100 years", () => {
      expect(advanceByInterval(utc(2024, 6, 15), "CENTURY", 1)).toEqual(utc(2124, 6, 15));
      expect(advanceByInterval(utc(2024, 6, 15), "CENTURY", -1)).toEqual(utc(1924, 6, 15));
    });
  });

  describe("MILLENIUM", () => {
    it("should advance by 1000 years", () => {
      expect(advanceByInterval(utc(2024, 6, 15), "MILLENIUM", 1)).toEqual(utc(3024, 6, 15));
      expect(advanceByInterval(utc(2024, 6, 15), "MILLENIUM", -1)).toEqual(utc(1024, 6, 15));
    });
  });

  describe("boundary cases", () => {
    it("should handle zero count", () => {
      const input = utc(2024, 6, 15);
      expect(advanceByInterval(input, "DAY", 0)).toEqual(input);
      expect(advanceByInterval(input, "MONTH", 0)).toEqual(input);
    });

    it("should handle large counts", () => {
      expect(advanceByInterval(utc(2024, 1, 1), "DAY", 366)).toEqual(utc(2025, 1, 1)); // 2024 is leap year
      expect(advanceByInterval(utc(2024, 1, 1), "MONTH", 24)).toEqual(utc(2026, 1, 1));
    });
  });
});
