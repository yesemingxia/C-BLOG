import { useState, useEffect, useCallback } from "react";

const CursorGlow = () => {
  const [position, setPosition] = useState({ x: -100, y: -100 });
  const [isVisible, setIsVisible] = useState(false);

  const handleMouseMove = useCallback((e: MouseEvent) => {
    setPosition({ x: e.clientX, y: e.clientY });
    if (!isVisible) setIsVisible(true);
  }, [isVisible]);

  const handleMouseLeave = useCallback(() => {
    setIsVisible(false);
  }, []);

  useEffect(() => {
    window.addEventListener("mousemove", handleMouseMove);
    document.body.addEventListener("mouseleave", handleMouseLeave);

    return () => {
      window.removeEventListener("mousemove", handleMouseMove);
      document.body.removeEventListener("mouseleave", handleMouseLeave);
    };
  }, [handleMouseMove, handleMouseLeave]);

  return (
    <div
      className="pointer-events-none fixed inset-0 z-[9999] overflow-hidden"
      aria-hidden="true"
    >
      <div
        className="absolute w-[500px] h-[500px] rounded-full transition-opacity duration-300"
        style={{
          left: position.x - 250,
          top: position.y - 250,
          opacity: isVisible ? 1 : 0,
          background: `radial-gradient(circle, var(--cursor-glow, rgba(99, 102, 241, 0.06)) 0%, transparent 70%)`,
          transform: "translate3d(0, 0, 0)",
          willChange: "left, top",
        }}
      />
    </div>
  );
};

export default CursorGlow;
