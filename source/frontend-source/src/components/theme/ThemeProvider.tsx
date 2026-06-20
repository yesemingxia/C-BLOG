import { createContext, useContext, useState, useEffect, useCallback, type ReactNode } from 'react';

// @cuiruoni+主题类型定义：保留day（明亮）和gray（浅灰）两种浅色模式
// 移除了原有的evening/night深色主题，避免默认黑/暗色背景
export type ThemeMode = 'day';

interface ThemeContextValue {
  theme: ThemeMode;
  isDark: boolean;
  /** 手动切换：当前仅支持day，可作为no-op或未来扩展 */
  toggleTheme: () => void;
  /** 设置为指定主题 */
  setTheme: (t: ThemeMode) => void;
}

const ThemeContext = createContext<ThemeContextValue>({
  theme: 'day',
  isDark: false,
  toggleTheme: () => {},
  setTheme: () => {},
});

export const useTheme = () => useContext(ThemeContext);

// @cuiruoni+主题提供者组件：管理浅色主题，支持localStorage持久化
export const ThemeProvider = ({ children }: { children: ReactNode }) => {
  /* 默认使用day主题，避免黑/暗色默认 */
  const [theme, setThemeState] = useState<ThemeMode>(() => {
    const saved = localStorage.getItem('blog_theme') as ThemeMode | null;
    // 校验localStorage中保存的值是否合法
    if (saved && ['day'].includes(saved)) return saved;
    return 'day';
  });

  // 仅保留浅色主题，isDark始终为false
  const isDark = false;

  // 将主题应用到DOM：设置data-theme属性并移除dark类
  const applyTheme = useCallback((t: ThemeMode) => {
    document.documentElement.setAttribute('data-theme', t);
    document.documentElement.classList.remove('dark');
  }, []);

  const setTheme = useCallback((t: ThemeMode) => {
    setThemeState(t);
    localStorage.setItem('blog_theme', t);
    applyTheme(t);
  }, [applyTheme]);

  // 手动切换：当前仅支持day，作为no-op保持UI稳定
  const toggleTheme = useCallback(() => {
    // 仅保留浅色主题，toggle保持no-op
  }, []);

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
