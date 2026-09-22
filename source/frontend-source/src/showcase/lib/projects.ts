/* projects.ts — 场景 2 的项目数据
 *
 * ⚠️ **当前 PROJECTS 是空数组**（2026-09-21 按「保留结构、清空数据」处理）。
 *
 * person 侧原有 4 条示例项目（Scene Scroll Portfolio / Background Source Layer /
 * Infinite Photo Flow / Glass Design System），那是作品集内容，与博客定位不符，已清空。
 *
 * **结构与交互完好无损**：卡片网格、悬停上浮、键盘可达性（tabindex + Enter/Space）、
 * 详情弹窗（360ms 开 / 280ms 关 / 四种关闭途径 / 切场景强制关）全部照常工作，
 * 往下面的数组里填数据就能看到东西。
 *
 * 空数组时网格位置会显示一条提示文案 —— 原版没有空态分支（因为原版总有 4 条数据），
 * 这是迁移时新增的，避免清空后看起来像坏掉了。
 */

export interface Project {
  id: string;
  /** 弹窗 kicker（全大写短句） */
  type: string;
  title: string;
  /** 卡片描述，样式表按 2 行截断 */
  description: string;
  /** 弹窗摘要，同样 2 行截断 */
  summary: string;
  /** Project Background，缺省回退 description */
  background?: string;
  /** Key Features → 渲染为 <ul><li>（不能改成别的标签，样式依赖） */
  features: string[];
  /** My Role → 渲染为 <ul><li> */
  role: string[];
  /** Tech Stack → 渲染为 <span> 序列 */
  tech: string[];
  /** 卡片底部标签 → 渲染为 <span> 序列 */
  tags: string[];
  status: string;
  /** 封面图，放 `public/showcase/assets/projects/` 下，写 `/showcase/assets/projects/xxx.svg`；
   *  也可以直接外链图片地址。留空则用 accent 铺底 */
  image?: string;
  /** CSS 渐变，无 image/video 时铺媒体区 */
  accent: string;
  /** 可选：有则媒体区用循环静音视频 */
  video?: string;
  demoUrl: string;
  githubUrl: string;
  /** false → Demo 按钮禁用，文案 "Coming Soon" */
  demoAvailable: boolean;
  /** false → GitHub 按钮禁用，文案 "Private Repo" */
  githubPublic: boolean;
}

export const PROJECTS: Project[] = [];

/* 填空模板 —— 复制下面这段到上面的数组里，改掉值即可：

  {
    id: "my-project",
    title: "项目标题",
    type: "CATEGORY / TAG",
    description: "一句话描述，卡片上显示，超过 2 行会被截断。",
    summary: "弹窗里的摘要，两三句话。",
    background: "项目背景，可以写动机与取舍；留空则回退用 description。",
    features: ["特性一", "特性二", "特性三"],
    role: ["你承担的角色"],
    tech: ["技术栈"],
    tags: ["标签"],
    status: "In Progress",
    image: "/showcase/assets/projects/my-cover.svg",
    accent: "linear-gradient(135deg, #0E3A4A, #071018)",
    demoUrl: "",
    githubUrl: "",
    demoAvailable: false,
    githubPublic: false,
  },

  注：demoAvailable / githubPublic 为 false 时，按钮显示 "Coming Soon" / "Private Repo"
  且不可点 —— 这是原版行为，不是 bug。
*/

export const findProject = (id: string): Project | null =>
  PROJECTS.find((p) => p.id === id) ?? null;

export default PROJECTS;
