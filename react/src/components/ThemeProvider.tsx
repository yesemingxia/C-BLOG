import { createContext, useContext, useState, useEffect, useCallback, type ReactNode } from 'react';

// @cuiruoni+主题类型定义：day(日间)、evening(傍晚)、night(夜间)三种模式
type ThemeMode = 'day' | 'evening' | 'night';

interface ThemeContextValue {
  theme: ThemeMode;
  isDark: boolean;
  /** 手动切换：day ↔ night */
  toggleTheme: () => void;
  /** 设置为指定主题 */
  setTheme: (t: ThemeMode) => void;
}

const ThemeContext = createContext<ThemeContextValue>({
  theme: 'night',
  isDark: true,
  toggleTheme: () => {},
  setTheme: () => {},
});

export const useTheme = () => useContext(ThemeContext);

// @cuiruoni+主题提供者组件：管理day/evening/night三模式，支持localStorage持久化和时间自动判断
export const ThemeProvider = ({ children }: { children: ReactNode }) => {
  /* 优先读取 localStorage，否则根据时间自动判断 */
  const [theme, setThemeState] = useState<ThemeMode>(() => {
    const saved = localStorage.getItem('portfolio_theme') as ThemeMode | null;
    // @cuiruoni+校验localStorage中保存的值是否合法，防止非法值导致主题异常
    if (saved && ['day', 'evening', 'night'].includes(saved)) return saved;
    // @cuiruoni+根据当前小时自动推断主题：8-17点日间，17-20点傍晚，其余夜间
    const hour = new Date().getHours();
    if (hour >= 8 && hour < 17) return 'day';
    if (hour >= 17 && hour < 20) return 'evening';
    return 'night';
  });

  // @cuiruoni+evening和night都视为深色模式，控制Tailwind的dark类和CSS变量
  const isDark = theme === 'night' || theme === 'evening';

  // @cuiruoni+将主题应用到DOM：设置data-theme属性和dark类，驱动CSS变量切换
  const applyTheme = useCallback((t: ThemeMode) => {
    document.documentElement.setAttribute('data-theme', t);
    if (t === 'night' || t === 'evening') {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
  }, []);

  const setTheme = useCallback((t: ThemeMode) => {
    setThemeState(t);
    // @cuiruoni+持久化主题选择到localStorage，刷新页面后恢复用户偏好
    localStorage.setItem('portfolio_theme', t);
    applyTheme(t);
  }, [applyTheme]);

  // @cuiruoni+手动切换：深色↔日间，简化用户操作（跳过evening中间态）
  const toggleTheme = useCallback(() => {
    setTheme(isDark ? 'day' : 'night');
  }, [isDark, setTheme]);

  /* 初始化时应用主题 */
  useEffect(() => {
    applyTheme(theme);
  }, [theme, applyTheme]);

  return (
    <ThemeContext.Provider value={{ theme, isDark, toggleTheme, setTheme }}>
      {children}
    </ThemeContext.Provider>
  );
};
