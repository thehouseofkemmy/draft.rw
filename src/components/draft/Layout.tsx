import { useState } from "react";
import { useNavigate } from "react-router-dom";
import LeftNav from "@/components/feed/LeftNav";
import BottomNav from "@/components/feed/BottomNav";

type Props = {
  children: React.ReactNode;
  sidebar?: React.ReactNode;
  onAuthOpen?: (mode: "join" | "login") => void;
};

export default function Layout({ children, sidebar, onAuthOpen }: Props) {
  const navigate = useNavigate();

  const handleAuthOpen = (mode: "join" | "login") => {
    if (onAuthOpen) {
      onAuthOpen(mode);
    } else {
      navigate("/auth");
    }
  };

  return (
    <div className="relative min-h-screen bg-background text-foreground transition-colors duration-200">
      {/* dot texture */}
      <div
        className="fixed inset-0 pointer-events-none z-0"
        style={{
          backgroundImage: "radial-gradient(hsl(25 22% 11% / 0.022) 1px, transparent 1px)",
          backgroundSize: "4px 4px",
        }}
        aria-hidden="true"
      />

      {/* Desktop / tablet: side-nav + feed (+ optional right sidebar) */}
      <div
        className="hidden md:grid gap-0 max-w-[1280px] mx-auto relative z-[1]"
        style={{
          gridTemplateColumns: sidebar
            ? "260px minmax(0, 598px) 340px"
            : "260px minmax(0, 598px)",
        }}
      >
        {/* Left nav — full labels on lg, icon-only on md */}
        <div className="hidden md:block">
          <LeftNav onAuthOpen={handleAuthOpen} />
        </div>

        {/* Center */}
        <main className="border-x border-rule/50 min-h-screen">{children}</main>

        {/* Right sidebar */}
        {sidebar && (
          <aside className="hidden lg:block">{sidebar}</aside>
        )}
      </div>

      {/* Mobile: single column */}
      <div className="md:hidden relative z-[1]">
        <main className="min-h-screen pb-16">{children}</main>
      </div>

      {/* Mobile bottom nav */}
      <BottomNav onAuthOpen={handleAuthOpen} />
    </div>
  );
}
