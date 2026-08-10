import { useEffect, useRef, useState } from "react";
import {
  BACKGROUND_CHANGE_EVENT,
  backgroundImage,
  loadBackground,
  type BackgroundSetting,
} from "../../lib/background";

const GlassBackground = () => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [bg, setBg] = useState<BackgroundSetting | null>(() => loadBackground());

  // @cuiruoni+监听背景设置变化（Settings 页保存后立即生效；storage 事件兼容多标签页）
  useEffect(() => {
    const apply = () => setBg(loadBackground());
    window.addEventListener(BACKGROUND_CHANGE_EVENT, apply);
    window.addEventListener("storage", apply);
    return () => {
      window.removeEventListener(BACKGROUND_CHANGE_EVENT, apply);
      window.removeEventListener("storage", apply);
    };
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let animationId: number;
    let time = 0;

    const resize = () => {
      canvas.width = window.innerWidth;
      canvas.height = window.innerHeight;
    };
    resize();
    window.addEventListener("resize", resize);

    const isDark = document.documentElement.classList.contains("dark");

    const orbs = [
      { x: 0.2, y: 0.3, radius: 0.4, speed: 0.0003, phase: 0, color: isDark ? "rgba(99, 102, 241, 0.04)" : "rgba(99, 102, 241, 0.03)" },
      { x: 0.8, y: 0.7, radius: 0.35, speed: 0.0004, phase: 2, color: isDark ? "rgba(168, 85, 247, 0.04)" : "rgba(168, 85, 247, 0.03)" },
      { x: 0.5, y: 0.5, radius: 0.45, speed: 0.0002, phase: 4, color: isDark ? "rgba(59, 130, 246, 0.04)" : "rgba(59, 130, 246, 0.03)" },
    ];

    const animate = () => {
      time += 1;
      ctx.clearRect(0, 0, canvas.width, canvas.height);

      orbs.forEach((orb) => {
        const x = canvas.width * (orb.x + Math.sin(time * orb.speed + orb.phase) * 0.15);
        const y = canvas.height * (orb.y + Math.cos(time * orb.speed * 0.8 + orb.phase) * 0.15);
        const radius = canvas.width * orb.radius;

        const gradient = ctx.createRadialGradient(x, y, 0, x, y, radius);
        gradient.addColorStop(0, orb.color);
        gradient.addColorStop(1, "transparent");

        ctx.fillStyle = gradient;
        ctx.fillRect(0, 0, canvas.width, canvas.height);
      });

      animationId = requestAnimationFrame(animate);
    };

    animate();

    const observer = new MutationObserver(() => {
      const newIsDark = document.documentElement.classList.contains("dark");
      orbs[0].color = newIsDark ? "rgba(99, 102, 241, 0.04)" : "rgba(99, 102, 241, 0.03)";
      orbs[1].color = newIsDark ? "rgba(168, 85, 247, 0.04)" : "rgba(168, 85, 247, 0.03)";
      orbs[2].color = newIsDark ? "rgba(59, 130, 246, 0.04)" : "rgba(59, 130, 246, 0.03)";
    });
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ["class"] });

    return () => {
      cancelAnimationFrame(animationId);
      window.removeEventListener("resize", resize);
      observer.disconnect();
    };
  }, []);

  // @cuiruoni+背景图：有自定义背景时渲染图片 + 主题色遮罩（保证前景可读），无则纯主题底色
  const img = backgroundImage(bg);

  return (
    <>
      {img ? (
        <>
          <div
            className="fixed inset-0 -z-20 bg-cover bg-center"
            style={{ backgroundImage: `url("${img}")` }}
          />
          <div className="fixed inset-0 -z-20 bg-[var(--background)]/55" />
        </>
      ) : (
        <div className="fixed inset-0 -z-20 bg-[var(--background)] transition-colors duration-500" />
      )}
      <canvas
        ref={canvasRef}
        className="fixed inset-0 -z-10 pointer-events-none"
        style={{ opacity: 0.8 }}
      />
    </>
  );
};

export default GlassBackground;
