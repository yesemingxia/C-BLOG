/* PullToLogin.tsx — 顶部「下拉进入登录」手势区
 *
 * 需求：页面上方不单独做登录按钮，而是放一个半透明的向下箭头；
 * 用户按住箭头往下拖，拖过阈值即跳转 /login，没拖够就弹回。
 *
 * 实现要点：
 *   · Pointer Events（鼠标/触摸通吃），setPointerCapture 后即使指针
 *     拖出手势区也继续跟踪；touch-action: none 防止移动端滚动打断。
 *   · 拖动进度写入 CSS 变量 --pull（0~1），样式层用 calc 做位移/变亮，
 *     避免每个 pointermove 都触发 React 重渲染。
 *   · position:fixed 必须留在 .content-track 外面（轨道带 transform，
 *     会把内部 fixed 退化成 absolute，规则同 MobileSceneControls）。
 */

import { useCallback, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../../components/auth/AuthProvider";

/** 下拉触发跳转的拖动距离（px） */
const PULL_THRESHOLD = 100;

const PullToLogin = () => {
  const navigate = useNavigate();
  // @cuiruoni+已登录就没有「下拉去登录」的意义，整块隐藏
  const { isLoggedIn } = useAuth();
  const tabRef = useRef<HTMLDivElement | null>(null);
  const startYRef = useRef(0);
  const draggingRef = useRef(false);
  const progressRef = useRef(0);
  /** 拖满阈值后文字变为「松手进入」，仅在跨过阈值那一刻 setState */
  const [armed, setArmed] = useState(false);

  const setProgress = useCallback((p: number) => {
    progressRef.current = p;
    tabRef.current?.style.setProperty("--pull", p.toFixed(3));
  }, []);

  const onPointerDown = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      if (e.pointerType === "mouse" && e.button !== 0) return;
      draggingRef.current = true;
      startYRef.current = e.clientY;
      setArmed(false);
      e.currentTarget.setPointerCapture(e.pointerId);
    },
    [],
  );

  const onPointerMove = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      if (!draggingRef.current) return;
      const d = Math.max(0, e.clientY - startYRef.current);
      const p = Math.min(1, d / PULL_THRESHOLD);
      setProgress(p);
      setArmed(p >= 1);
    },
    [setProgress],
  );

  const onPointerEnd = useCallback(() => {
    if (!draggingRef.current) return;
    draggingRef.current = false;
    const reached = progressRef.current >= 1;
    setProgress(0);
    setArmed(false);
    if (reached) navigate("/login");
  }, [navigate, setProgress]);

  // @cuiruoni+登录后不渲染（必须放在所有 hooks 之后，保证 hook 顺序稳定）
  if (isLoggedIn) return null;

  return (
    <div
      ref={tabRef}
      className={"pull-login" + (armed ? " is-armed" : "")}
      role="button"
      aria-label="按住下拉进入登录页"
      title="按住下拉进入登录页"
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerEnd}
      onPointerCancel={onPointerEnd}
      onLostPointerCapture={onPointerEnd}
    >
      <svg className={"pull-login-arrow" + (armed ? " is-armed" : "")} viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
        <path d="M6 9l6 6 6-6" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
      <svg className={"pull-login-arrow pull-login-arrow-b" + (armed ? " is-armed" : "")} viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
        <path d="M6 9l6 6 6-6" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
      <span className="pull-login-hint">{armed ? "松手进入" : "按住下拉登录"}</span>
    </div>
  );
};

export default PullToLogin;
