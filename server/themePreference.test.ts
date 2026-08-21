import { describe, expect, it } from "vitest";
import { normalizeThemePreference, resolveThemePreference } from "../client/src/contexts/ThemeContext";

describe("theme preference resolution", () => {
  it("uses only supported stored values and falls back to the system preference", () => {
    expect(normalizeThemePreference("dark")).toBe("dark");
    expect(normalizeThemePreference("unexpected-value")).toBe("system");
    expect(normalizeThemePreference(null)).toBe("system");
    expect(resolveThemePreference("system", true)).toBe("dark");
    expect(resolveThemePreference("system", false)).toBe("light");
    expect(resolveThemePreference("light", true)).toBe("light");
  });
});
