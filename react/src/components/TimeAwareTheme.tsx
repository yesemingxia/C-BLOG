import { useEffect, useState } from 'react';

const TimeAwareTheme = () => {
  const [theme, setTheme] = useState<'day' | 'evening' | 'night'>('day');

  useEffect(() => {
    const updateTheme = () => {
      const hour = new Date().getHours();
      let newTheme: 'day' | 'evening' | 'night' = 'day';
      
      if (hour >= 5 && hour < 17) newTheme = 'day';
      else if (hour >= 17 && hour < 20) newTheme = 'evening';
      else newTheme = 'night';
      
      setTheme(newTheme);
      document.documentElement.setAttribute('data-theme', newTheme);
      
      // Also sync dark mode class for tailwind if needed
      if (newTheme === 'night' || newTheme === 'evening') {
        document.documentElement.classList.add('dark');
      } else {
        document.documentElement.classList.remove('dark');
      }
    };

    updateTheme();
    const interval = setInterval(updateTheme, 60000);
    return () => clearInterval(interval);
  }, []);

  return null;
};

export default TimeAwareTheme;
