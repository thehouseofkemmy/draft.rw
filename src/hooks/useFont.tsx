import { useEffect, useState } from "react";

type Font = "serif" | "sans";

const KEY = "drw:font";

function read(): Font {
  try { return (localStorage.getItem(KEY) as Font) ?? "serif"; } catch { return "serif"; }
}

function apply(font: Font) {
  document.documentElement.classList.toggle("font-pref-sans", font === "sans");
}

export function useFont() {
  const [font, setFont] = useState<Font>(read);

  useEffect(() => { apply(font); }, [font]);

  const setAndSave = (f: Font) => {
    try { localStorage.setItem(KEY, f); } catch {}
    setFont(f);
    apply(f);
  };

  return { font, setFont: setAndSave };
}
