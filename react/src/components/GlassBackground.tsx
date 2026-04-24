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

    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;

    const particles: Array<{
      x: number; y: number; size: number; speedY: number;
      speedX: number; opacity: number; color: string;
    }> = [];

    const colors = ["rgba(124,106,255,", "rgba(56,189,248,", "rgba(244,114,182,", "rgba(52,211,153,"];

    for (let i = 0; i < 60; i++) {
      particles.push({
        x: Math.random() * canvas.width,
        y: Math.random() * canvas.height,
        size: Math.random() * 2.5 + 0.5,
        speedY: Math.random() * 0.4 + 0.1,
        speedX: (Math.random() - 0.5) * 0.3,
        opacity: Math.random() * 0.5 + 0.2,
        color: colors[Math.floor(Math.random() * colors.length)],
      });
    }

    let animId: number;
    const animate = () => {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      particles.forEach((p) => {
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
        ctx.fillStyle = `${p.color}${p.opacity})`;
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

    const handleResize = () => {
      canvas.width = window.innerWidth;
      canvas.height = window.innerHeight;
    };
    window.addEventListener("resize", handleResize);

    return () => {
      cancelAnimationFrame(animId);
      window.removeEventListener("resize", handleResize);
    };
  }, [showParticles]);

  return (
    <div data-cmp="GlassBackground" className="fixed inset-0 pointer-events-none overflow-hidden" style={{ zIndex: 0 }}>
      {/* Deep space gradient */}
      <div
        className="absolute inset-0"
        style={{
          background: `radial-gradient(ellipse at 20% 50%, rgba(124,106,255,0.08) 0%, transparent 50%),
                       radial-gradient(ellipse at 80% 20%, rgba(56,189,248,0.06) 0%, transparent 50%),
                       radial-gradient(ellipse at 60% 80%, rgba(244,114,182,0.05) 0%, transparent 50%),
                       linear-gradient(180deg, #050816 0%, #0a0d2e 50%, #050816 100%)`,
        }}
      />
      {/* Animated orbs */}
      <div
        className="orb orb-purple"
        style={{ width: 600, height: 600, top: "-10%", left: "-5%", animationDuration: "10s" }}
      />
      <div
        className="orb orb-cyan"
        style={{ width: 500, height: 500, top: "30%", right: "-8%", animationDuration: "12s" }}
      />
      <div
        className="orb orb-pink"
        style={{ width: 400, height: 400, bottom: "-5%", left: "40%", animationDuration: "9s" }}
      />
      {/* Stars */}
      <div className="absolute inset-0" style={{
        backgroundImage: `radial-gradient(1px 1px at 10% 15%, rgba(255,255,255,0.4) 0%, transparent 100%),
                          radial-gradient(1px 1px at 25% 35%, rgba(255,255,255,0.3) 0%, transparent 100%),
                          radial-gradient(1.5px 1.5px at 40% 10%, rgba(255,255,255,0.5) 0%, transparent 100%),
                          radial-gradient(1px 1px at 55% 55%, rgba(255,255,255,0.3) 0%, transparent 100%),
                          radial-gradient(1px 1px at 70% 25%, rgba(255,255,255,0.4) 0%, transparent 100%),
                          radial-gradient(1.5px 1.5px at 85% 70%, rgba(255,255,255,0.5) 0%, transparent 100%),
                          radial-gradient(1px 1px at 15% 75%, rgba(255,255,255,0.3) 0%, transparent 100%),
                          radial-gradient(1px 1px at 92% 40%, rgba(255,255,255,0.4) 0%, transparent 100%),
                          radial-gradient(1px 1px at 62% 88%, rgba(255,255,255,0.3) 0%, transparent 100%),
                          radial-gradient(1.5px 1.5px at 33% 60%, rgba(255,255,255,0.5) 0%, transparent 100%)`,
      }} />
      {/* Particle canvas */}
      <canvas ref={canvasRef} className="absolute inset-0" style={{ opacity: 0.6 }} />
    </div>
  );
};

export default GlassBackground;
