import { createContext, useContext, useEffect, useState } from "react";

type Theme = "light" | "dark";
type ThemePreference = Theme | "system";

interface ThemeContextType { theme: Theme; preference: ThemePreference; toggleTheme: () => void; setPreference: (preference: ThemePreference) => void; switchable: boolean; }
const ThemeContext = createContext<ThemeContextType | undefined>(undefined);
interface ThemeProviderProps { children: React.ReactNode; defaultTheme?: ThemePreference; switchable?: boolean; }
const storageKey = "research-intelligence-theme";

function systemTheme(): Theme { return window.matchMedia?.("(prefers-color-scheme: dark)").matches ? "dark" : "light"; }
export function normalizeThemePreference(value: string | null | undefined): ThemePreference { return value === "light" || value === "dark" || value === "system" ? value : "system"; }
export function resolveThemePreference(preference: ThemePreference, systemIsDark: boolean): Theme { return preference === "system" ? systemIsDark ? "dark" : "light" : preference; }

export function ThemeProvider({ children, defaultTheme = "system", switchable = false }: ThemeProviderProps) {
  const [preference, setPreference] = useState<ThemePreference>(() => switchable ? normalizeThemePreference(localStorage.getItem(storageKey)) : defaultTheme);
  const [theme, setTheme] = useState<Theme>(() => resolveThemePreference(preference, systemTheme() === "dark"));
  useEffect(() => {
    const apply = () => setTheme(resolveThemePreference(preference, systemTheme() === "dark"));
    apply();
    if (preference !== "system") return;
    const media = window.matchMedia("(prefers-color-scheme: dark)");
    media.addEventListener("change", apply);
    return () => media.removeEventListener("change", apply);
  }, [preference]);
  useEffect(() => { document.documentElement.classList.toggle("dark", theme === "dark"); if (switchable) localStorage.setItem(storageKey, preference); }, [theme, preference, switchable]);
  const toggleTheme = () => setPreference(theme === "dark" ? "light" : "dark");
  return <ThemeContext.Provider value={{ theme, preference, toggleTheme, setPreference, switchable }}>{children}</ThemeContext.Provider>;
}
export function useTheme() { const context = useContext(ThemeContext); if (!context) throw new Error("useTheme must be used within ThemeProvider"); return context; }
