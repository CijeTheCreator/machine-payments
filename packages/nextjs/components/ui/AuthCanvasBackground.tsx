"use client";

import React, { useEffect, useRef } from "react";

export default function AuthCanvasBackground() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let animationFrameId: number;
    let width = (canvas.width = canvas.offsetWidth * 2);
    let height = (canvas.height = canvas.offsetHeight * 2);

    const handleResize = () => {
      if (!canvas) return;
      width = canvas.width = canvas.offsetWidth * 2;
      height = canvas.height = canvas.offsetHeight * 2;
    };

    window.addEventListener("resize", handleResize);

    const spacing = 32;
    let time = 0;

    const render = () => {
      time += 0.015;
      ctx.clearRect(0, 0, width, height);

      const cols = Math.floor(width / spacing);
      const rows = Math.floor(height / spacing);
      const offsetX = (width % spacing) / 2;
      const offsetY = (height % spacing) / 2;

      for (let i = 0; i <= cols; i++) {
        for (let j = 0; j <= rows; j++) {
          const x = offsetX + i * spacing;
          const y = offsetY + j * spacing;

          // Radial distance from center for subtle vignette
          const dx = (x - width / 2) / (width / 2);
          const dy = (y - height / 2) / (height / 2);
          const distSq = dx * dx + dy * dy;
          const vignette = Math.max(0, 1 - distSq * 0.9);

          // Subtle wave
          const wave = Math.sin(time + i * 0.2 + j * 0.2) * 0.5 + 0.5;
          const alpha = 0.04 + wave * 0.08 * vignette;

          if (vignette > 0.05) {
            ctx.fillStyle = `rgba(0, 0, 0, ${alpha})`;
            ctx.fillRect(x - 1, y - 1, 2, 2);
          }
        }
      }

      animationFrameId = requestAnimationFrame(render);
    };

    render();

    return () => {
      window.removeEventListener("resize", handleResize);
      cancelAnimationFrame(animationFrameId);
    };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      className="w-full h-full pointer-events-none select-none opacity-90"
      style={{ width: "100%", height: "100%" }}
    />
  );
}
