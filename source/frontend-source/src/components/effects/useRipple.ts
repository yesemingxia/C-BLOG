import { useCallback, type MouseEvent } from "react";

interface RippleStyle {
  x: number;
  y: number;
  size: number;
  id: number;
}

let rippleCounter = 0;

export const useRipple = () => {
  const createRipple = useCallback((e: MouseEvent<HTMLElement>) => {
    const target = e.currentTarget;
    const rect = target.getBoundingClientRect();
    const size = Math.max(rect.width, rect.height) * 2;
    const x = e.clientX - rect.left - size / 2;
    const y = e.clientY - rect.top - size / 2;
    const id = ++rippleCounter;

    const ripple = document.createElement("span");
    ripple.style.cssText = `
      position: absolute;
      left: ${x}px;
      top: ${y}px;
      width: ${size}px;
      height: ${size}px;
      border-radius: 50%;
      background: var(--ripple-color, rgba(255, 255, 255, 0.2));
      transform: scale(0);
      animation: ripple-effect 0.6s ease-out forwards;
      pointer-events: none;
      z-index: 10;
    `;

    target.style.position = target.style.position || "relative";
    target.style.overflow = "hidden";
    target.appendChild(ripple);

    setTimeout(() => ripple.remove(), 600);
  }, []);

  return createRipple;
};
