/* ProjectModal.tsx — 项目详情弹窗
 *
 * 迁移自 `person/index.html:96-137` + `project-cards.js:192-252`。
 *
 * ⚠️ 必须挂在 `.ssp-scope.ssp-portal-root`（Showcase.tsx 里那第二个空容器）上，
 *    不能挂在 `.site-shell` 内、也不能 portal 到 `document.body`：
 *
 *    · 挂 `.site-shell` 内 → 祖先 `.content-track` 带 `transform` + `will-change`，
 *      会让弹窗的 position:fixed 退化成 absolute（person 的 index.html 有注释说明这点）。
 *    · portal 到 `document.body` → 脱离 `.ssp-scope`，`.project-modal-*` 的所有规则
 *      （现在都带 .ssp-scope 前缀）一条都不命中，弹窗会以裸 DOM 的样子出现。
 *
 * 时序照抄原版：打开 360ms、关闭 280ms，期间 isAnimating 锁防止重入。
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { bus, EVT } from "../lib/bus";
import type { Project } from "../lib/projects";

const OPEN_MS = 360;
const CLOSE_MS = 280;

interface ProjectModalProps {
  /** 非空即表示要显示（由父组件控制） */
  project: Project | null;
  /** 关闭动画播完后调用，父组件据此清空 project */
  onClose: () => void;
}

/** 底部两个操作入口：可用则是真链接，不可用则禁用并显示提示文案 */
const ActionLink = ({
  available,
  url,
  disabledText,
  label,
  secondary,
}: {
  available: boolean;
  url: string;
  disabledText: string;
  label: string;
  secondary?: boolean;
}) => {
  const cls = "project-modal-cta" + (secondary ? " project-modal-cta-secondary" : "");
  if (available && url) {
    return (
      <a className={cls} href={url} target="_blank" rel="noopener noreferrer">
        {label}
      </a>
    );
  }
  return (
    <a
      className={cls}
      href={undefined}
      aria-disabled="true"
      tabIndex={-1}
      onClick={(e) => e.preventDefault()}
    >
      {disabledText}
    </a>
  );
};

const ProjectModal = ({ project, onClose }: ProjectModalProps) => {
  /** hidden 的反面：是否在 DOM 里 */
  const [rendered, setRendered] = useState(false);
  /** is-open：驱动打开/关闭的 CSS 过渡 */
  const [opened, setOpened] = useState(false);

  /** 动画锁，防止 360/280ms 内重入（原版 isAnimating） */
  const animatingRef = useRef(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const overlayRef = useRef<HTMLDivElement | null>(null);
  const renderedRef = useRef(false);

  useEffect(() => {
    renderedRef.current = rendered;
  }, [rendered]);

  const clearTimer = useCallback(() => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  /* ---------------- 打开 ---------------- */
  useEffect(() => {
    if (!project || animatingRef.current) return;
    animatingRef.current = true;
    setRendered(true);
    // 先让 hidden 的节点进一次布局，再加 is-open，过渡才会真正播放
    requestAnimationFrame(() => {
      setOpened(true);
      clearTimer();
      timerRef.current = setTimeout(() => {
        animatingRef.current = false;
        timerRef.current = null;
      }, OPEN_MS);
    });
  }, [project, clearTimer]);

  /* ---------------- 关闭（带动画） ---------------- */
  const requestClose = useCallback(() => {
    if (animatingRef.current || !renderedRef.current) return;
    animatingRef.current = true;
    setOpened(false);
    clearTimer();
    timerRef.current = setTimeout(() => {
      setRendered(false);
      animatingRef.current = false;
      timerRef.current = null;
      onClose();
    }, CLOSE_MS);
  }, [clearTimer, onClose]);

  /* ---------------- 场景切换强制关闭（无动画）
     原版监听 scene:change → forceClose()，避免弹窗跨场景残留 ---------------- */
  useEffect(
    () =>
      bus.on(EVT.sceneChange, () => {
        if (!renderedRef.current) return;
        clearTimer();
        animatingRef.current = false;
        setOpened(false);
        setRendered(false);
        onClose();
      }),
    [clearTimer, onClose],
  );

  /* ---------------- Esc 关闭 ---------------- */
  useEffect(() => {
    if (!rendered) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") requestClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [rendered, requestClose]);

  /* ---------------- 弹窗内的 wheel / touch 不冒泡到场景切换
     （原版 project-cards.js:250-251；用原生监听而非 React onWheel，
       因为要确保在 window 上的场景导航监听器之前截住） ---------------- */
  useEffect(() => {
    const el = overlayRef.current;
    if (!el) return;
    const stop = (e: Event) => e.stopPropagation();
    el.addEventListener("wheel", stop, { passive: true });
    el.addEventListener("touchmove", stop, { passive: true });
    return () => {
      el.removeEventListener("wheel", stop);
      el.removeEventListener("touchmove", stop);
    };
  }, [rendered]);

  /* ---------------- 卸载清理 ---------------- */
  useEffect(() => () => clearTimer(), [clearTimer]);

  if (!rendered || !project) return null;

  const media = project.video ? (
    <video className="media-fill" src={project.video} muted loop autoPlay playsInline />
  ) : project.image ? (
    <img className="media-fill" src={project.image} alt={project.title} />
  ) : (
    <div style={{ width: "100%", height: "100%", background: project.accent || "#12202A" }} />
  );

  return (
    <div
      ref={overlayRef}
      className={"project-modal-overlay" + (opened ? " is-open" : "")}
      role="dialog"
      aria-modal="true"
      aria-labelledby="projectModalTitle"
    >
      <div className="project-modal-backdrop" onClick={requestClose} />
      <div className="project-modal-card" tabIndex={-1}>
        <button
          className="project-modal-close"
          type="button"
          aria-label="关闭项目详情"
          onClick={requestClose}
        >
          <svg
            width="24"
            height="24"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
          >
            <path d="M18 6L6 18M6 6l12 12" />
          </svg>
        </button>

        <div className="project-modal-media">{media}</div>

        <div className="project-modal-content">
          <div className="project-modal-kicker">{project.type}</div>
          <h3 className="project-modal-title" id="projectModalTitle">
            {project.title}
          </h3>
          <p className="project-modal-summary">{project.summary}</p>

          <div className="project-modal-grid">
            <section className="project-detail-section">
              <h4>Project Background</h4>
              {/* 缺省回退 description（原版 p.background || p.description） */}
              <p>{project.background || project.description}</p>
            </section>

            <section className="project-detail-section">
              <h4>Key Features</h4>
              {/* 必须是 <ul><li>：样式表按列表排版，换成纯文本会丢项目符号 */}
              <ul>
                {project.features.map((f) => (
                  <li key={f}>{f}</li>
                ))}
              </ul>
            </section>

            <section className="project-detail-section">
              <h4>My Role</h4>
              <ul>
                {project.role.map((r) => (
                  <li key={r}>{r}</li>
                ))}
              </ul>
            </section>

            <section className="project-detail-section">
              <h4>Tech Stack</h4>
              {/* Tech 必须是 <span> 序列（.project-tech-list span 排版） */}
              <div className="project-tech-list">
                {project.tech.map((t) => (
                  <span key={t}>{t}</span>
                ))}
              </div>
            </section>
          </div>

          <div className="project-modal-footer">
            <span className="project-status">{project.status}</span>
            <div className="project-modal-actions">
              <ActionLink
                available={project.demoAvailable}
                url={project.demoUrl}
                disabledText="Coming Soon"
                label="View Demo"
              />
              <ActionLink
                available={project.githubPublic}
                url={project.githubUrl}
                disabledText="Private Repo"
                label="GitHub"
                secondary
              />
              <button
                className="project-modal-cta project-modal-cta-secondary"
                type="button"
                onClick={requestClose}
              >
                Close
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ProjectModal;
