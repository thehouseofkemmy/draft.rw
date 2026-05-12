import { createContext, useContext, useEffect, useState, ReactNode } from "react";

type ThemeCtx = { isDark: boolean; toggle: () => void };

const Ctx = createContext<ThemeCtx>({ isDark: false, toggle: () => {} });

export const ThemeProvider = ({ children }: { children: ReactNode }) => {
  const [isDark, setIsDark] = useState(() => localStorage.getItem("theme") === "dark");

  useEffect(() => {
    document.documentElement.classList.toggle("dark", isDark);
    localStorage.setItem("theme", isDark ? "dark" : "light");
  }, [isDark]);

  return (
    <Ctx.Provider value={{ isDark, toggle: () => setIsDark((d) => !d) }}>
      {children}
    </Ctx.Provider>
  );
};

export const useTheme = () => useContext(Ctx);
