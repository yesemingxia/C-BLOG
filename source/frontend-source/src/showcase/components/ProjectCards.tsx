/* ProjectCards.tsx — 项目卡片网格
 *
 * 迁移自 `person/project-cards.js:106-134`（renderCards）。
 *
 * ⚠️ 结构契约（样式表按这些标签排版，改了会丢样式）：
 *    · 卡片必须是 <article class="project-card">，带 tabindex=0 + role=button，
 *      并支持 Enter / Space 打开（原版有键盘可达性）
 *    · 标签必须是 <span> 序列（.project-tags span）
 *    · 描述靠 CSS 做 2 行截断，不要自己截字符串
 */

import type { Project } from "../lib/projects";

interface ProjectCardProps {
  project: Project;
  onOpen: (p: Project) => void;
}

const ProjectCard = ({ project: p, onOpen }: ProjectCardProps) => (
  <article
    className="project-card"
    data-project-id={p.id}
    tabIndex={0}
    role="button"
    aria-label={`查看项目详情：${p.title}`}
    onClick={() => onOpen(p)}
    onKeyDown={(e) => {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        onOpen(p);
      }
    }}
  >
    <div className="project-image-wrap">
      {p.image ? (
        <img className="project-card-image" src={p.image} alt={p.title} loading="lazy" />
      ) : (
        <div className="project-card-image" style={{ background: p.accent || "#12202A" }} />
      )}
    </div>
    <div className="project-card-info">
      <h3 className="project-card-title">{p.title}</h3>
      <p className="project-card-description">{p.description}</p>
      <div className="project-tags">
        {p.tags.map((t) => (
          <span key={t}>{t}</span>
        ))}
      </div>
    </div>
  </article>
);

interface ProjectCardsProps {
  projects: Project[];
  /** 场景 2 离场动效：加 is-leaving 让卡片上移淡出（320ms，由 CONFIG.scene2ExitDelay 控制） */
  leaving: boolean;
  onOpen: (p: Project) => void;
}

const ProjectCards = ({ projects, leaving, onOpen }: ProjectCardsProps) => {
  const gridClass = "project-cards-grid" + (leaving ? " is-leaving" : "");

  /* 空态：原版没有这条分支（它总有 4 条数据）。清空数据后若什么都不显示，
     场景 2 右侧会是一片空白、看起来像坏了。
     这里复用相册的空态样式 `.photo-empty`（虚线框 + 灰字），两处视觉一致，
     也避免为一个提示文案往 showcase.css（生成文件）里加新类。
     文案是**访客向**的 —— "怎么加数据"属于维护说明，写在 lib/projects.ts 的注释里。 */
  if (!projects.length) {
    return (
      <div className={gridClass} id="projectGrid">
        <p className="photo-empty">项目内容待补充</p>
      </div>
    );
  }

  return (
    <div className={gridClass} id="projectGrid">
      {projects.map((p) => (
        <ProjectCard key={p.id} project={p} onOpen={onOpen} />
      ))}
    </div>
  );
};

export default ProjectCards;
