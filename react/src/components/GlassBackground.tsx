import { useEffect, useRef } from "react";

interface GlassBackgroundProps {
  showParticles?: boolean;
}

const GlassBackground = ({ showParticles = true }: GlassBackgroundProps) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);

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

    const particles: Array<{
      x: number; y: number; size: number; speedY: number;
      speedX: number; opacity: number; color: string;
    }> = [];

    const colors = ["124, 106, 255", "56, 189, 248", "244, 114, 182"];

    for (let i = 0; i < 40; i++) {
      particles.push({
        x: Math.random() * canvas.width,
        y: Math.random() * canvas.height,
        size: Math.random() * 2 + 0.5,
        speedY: Math.random() * 0.3 + 0.1,
        speedX: (Math.random() - 0.5) * 0.2,
        opacity: Math.random() * 0.4 + 0.1,
        color: colors[Math.floor(Math.random() * colors.length)],
      });
    }

    let animId: number;
    const animate = () => {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      particles.forEach((p) => {
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(${p.color}, ${p.opacity})`;
        ctx.fill();
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
    animate();

    window.addEventListener("resize", setCanvasSize);
    return () => {
      cancelAnimationFrame(animId);
      window.removeEventListener("resize", setCanvasSize);
    };
  }, [showParticles]);

  return (
    <div data-cmp="GlassBackground" className="fixed inset-0 pointer-events-none -z-10 overflow-hidden bg-background transition-colors duration-700">
      {/* Dynamic light orbs */}
      <div className="absolute top-[-10%] left-[-10%] w-[40vw] h-[40vw] rounded-full bg-indigo-500/10 blur-[120px] animate-pulse" style={{ animationDuration: '8s' }} />
      <div className="absolute bottom-[-10%] right-[-10%] w-[35vw] h-[35vw] rounded-full bg-sky-500/10 blur-[100px] animate-pulse" style={{ animationDuration: '10s' }} />
      
      {/* Subtle Grid pattern */}
      <div className="absolute inset-0 opacity-[0.03] dark:opacity-[0.05]" 
           style={{ backgroundImage: `linear-gradient(var(--border) 1px, transparent 1px), linear-gradient(90deg, var(--border) 1px, transparent 1px)`, backgroundSize: '40px 40px' }} />
      
      {/* Particle canvas */}
      <canvas ref={canvasRef} className="absolute inset-0 opacity-40 dark:opacity-60" />
      
      {/* Vignette effect */}
      <div className="absolute inset-0 bg-radial-gradient(circle at 50% 50%, transparent 0%, rgba(var(--background-rgb), 0.3) 100%) pointer-events-none" />
    </div>
  );
};

export default GlassBackground;
