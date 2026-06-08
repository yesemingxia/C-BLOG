import { useEffect, useRef } from "react";

interface GlassBackgroundProps {
  showParticles?: boolean;
}

// @cuiruoni+玻璃态背景组件：Canvas粒子动画+CSS渐变光球+网格纹理+暗角效果，营造深色科技感氛围
const GlassBackground = ({ showParticles = true }: GlassBackgroundProps) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  // @cuiruoni+Canvas粒子动画：50个霓虹色粒子缓慢上浮，大粒子带发光效果
  useEffect(() => {
    if (!showParticles) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const setCanvasSize = () => {
      canvas.width = window.innerWidth;
      canvas.height = window.innerHeight;
    };
    setCanvasSize();

    /* Neon-themed particle colors matching purple/blue palette */
    // @cuiruoni+粒子颜色与主题紫蓝配色一致，保持视觉统一
    const particles: Array<{
      x: number; y: number; size: number; speedY: number;
      speedX: number; opacity: number; color: string;
    }> = [];

    const colors = ["124, 106, 255", "56, 189, 248", "168, 85, 247", "99, 102, 241"];

    for (let i = 0; i < 50; i++) {
      particles.push({
        x: Math.random() * canvas.width,
        y: Math.random() * canvas.height,
        size: Math.random() * 2.5 + 0.5,
        speedY: Math.random() * 0.25 + 0.05,
        speedX: (Math.random() - 0.5) * 0.15,
        opacity: Math.random() * 0.35 + 0.05,
        color: colors[Math.floor(Math.random() * colors.length)],
      });
    }

    let animId: number;
    // @cuiruoni+检测用户是否偏好减少动画，尊重系统无障碍设置
    const prefersReducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    const animate = () => {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      particles.forEach((p) => {
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(${p.color}, ${p.opacity})`;
        ctx.fill();
        /* Subtle glow effect on larger particles */
        if (p.size > 1.5) {
          ctx.beginPath();
          ctx.arc(p.x, p.y, p.size * 3, 0, Math.PI * 2);
          ctx.fillStyle = `rgba(${p.color}, ${p.opacity * 0.15})`;
          ctx.fill();
        }
        p.y -= p.speedY;
        p.x += p.speedX;
        if (p.y < -10) {
          p.y = canvas.height + 10;
          p.x = Math.random() * canvas.width;
        }
        if (p.x < -10) p.x = canvas.width + 10;
        if (p.x > canvas.width + 10) p.x = -10;
      });
      animId = requestAnimationFrame(animate);
    };

    /* Respect reduced-motion preference */
    if (!prefersReducedMotion) {
      animate();
    }

    // @cuiruoni+清理函数：组件卸载时取消动画帧和resize监听，防止内存泄漏
    window.addEventListener("resize", setCanvasSize);
    return () => {
      cancelAnimationFrame(animId);
      window.removeEventListener("resize", setCanvasSize);
    };
  }, [showParticles]);

  return (
    <div data-cmp="GlassBackground" className="fixed inset-0 pointer-events-none -z-10 overflow-hidden bg-background transition-colors duration-700">
      {/* Neon gradient orbs — purple top-left, blue bottom-right */}
      <div className="absolute top-[-15%] left-[-10%] w-[45vw] h-[45vw] rounded-full bg-[var(--neon-purple)]/8 blur-[120px] animate-pulse" style={{ animationDuration: '8s' }} />
      <div className="absolute bottom-[-15%] right-[-10%] w-[40vw] h-[40vw] rounded-full bg-[var(--neon-blue)]/8 blur-[100px] animate-pulse" style={{ animationDuration: '10s' }} />
      {/* Third accent orb for depth */}
      <div className="absolute top-[40%] right-[20%] w-[25vw] h-[25vw] rounded-full bg-purple-500/5 blur-[80px] animate-pulse" style={{ animationDuration: '12s' }} />

      {/* Subtle grid pattern — CSS-only decorative element */}
      <div
        className="absolute inset-0 opacity-[0.02] dark:opacity-[0.04]"
        style={{
          backgroundImage: `linear-gradient(var(--neon-purple) 1px, transparent 1px), linear-gradient(90deg, var(--neon-purple) 1px, transparent 1px)`,
          backgroundSize: '60px 60px',
        }}
      />

      {/* Particle canvas */}
      <canvas ref={canvasRef} className="absolute inset-0 opacity-40 dark:opacity-60" />

      {/* Vignette effect */}
      <div className="absolute inset-0 pointer-events-none" style={{ background: 'radial-gradient(circle at 50% 50%, transparent 0%, rgba(5,8,22,0.3) 100%)' }} />
    </div>
  );
};

export default GlassBackground;
