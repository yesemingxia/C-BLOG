import React, { useEffect, useState } from 'react';

const TimeAwareTheme = () => {
  const [theme, setTheme] = useState<'day' | 'evening' | 'night'>('day');

  useEffect(() => {
    const updateTheme = () => {
      const hour = new Date().getHours();
      if (hour >= 5 && hour < 17) setTheme('day');
      else if (hour >= 17 && hour < 20) setTheme('evening');
      else setTheme('night');
    };

    updateTheme();
    const interval = setInterval(updateTheme, 60000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    const root = document.documentElement;
    if (theme === 'day') {
      root.style.setProperty('--background', '#f8fafc');
      root.style.setProperty('--foreground', '#0f172a');
      root.style.setProperty('--card', 'rgba(255, 255, 255, 0.7)');
      root.style.setProperty('--primary', '#4f46e5');
    } else if (theme === 'evening') {
      root.style.setProperty('--background', '#1e293b');
      root.style.setProperty('--foreground', '#f1f5f9');
      root.style.setProperty('--card', 'rgba(30, 41, 59, 0.8)');
      root.style.setProperty('--primary', '#8b5cf6');
    } else {
      root.style.setProperty('--background', '#050816');
      root.style.setProperty('--foreground', '#e8eaf6');
      root.style.setProperty('--card', 'rgba(255, 255, 255, 0.06)');
      root.style.setProperty('--primary', '#7c6aff');
    }
  }, [theme]);

  return null;
};

export default TimeAwareTheme;
