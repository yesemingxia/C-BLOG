/* SceneEditor.tsx — 场景 3：Markdown 编辑器（**发布入口**）
 *
 * 取代原来的 3D 照片流（SceneGallery）。**功能迁移自 C-BLOG 的 `pages/Write.tsx`**，
 * 但视觉没有跟着搬 —— 依然是 showcase 的语言（暗色舞台 / 玻璃面板 / 青色点缀），
 * 也就是「页面不变，功能变」：场景 3 还是那一屏，只是从「看图」变成「写 md」。
 *
 * ## 2026-09-21 起：这个编辑器就是写博客的地方，直接接后端
 *
 * 用户拍板「场景 3 的编辑器就是后续要写博客的地方，直接对接后端 API，
 * 就像原本那个博客页面一样，只是换了背景」。所以现在与 `Write.tsx` **功能对齐**：
 *
 *   · 保存草稿 / 发布 → `postsApi.create` / `postsApi.update`
 *   · 标签 → `tagsApi.list()`，最多 5 个，可自定义
 *   · 封面 / 摘要 / 可见性 → 发布面板里，与 Write 一致
 *   · 编辑已有文章 → 读 URL 的 `?edit=<id>`，与 Write 一致
 *
 * **仍然保留的 showcase 特有做法**（不是漏迁，是这个位置的正确解法）：
 *   · 本地自动保存（debounce 700ms）—— 这里是滚轮切场景，用户随时会滑走再滑回来，
 *     只有手动保存不够稳。本地草稿是**兜底**，不替代后端保存。
 *   · 去掉文字颜色选择器 —— 它是为 Write 的**浅色**背景解决对比度的；
 *     这里固定暗色，放开改色只会破坏一致性。
 *   · 预览解析比 Write 强两项：围栏代码块、行内 `粗体` / `代码` / `链接`。
 *
 * ## ⚠️ 发布面板必须走 portal
 *
 * 本组件渲染在 `.content-track` 内，而轨道带 `transform` —— 内部的 `position: fixed`
 * 会退化成相对轨道定位，全屏遮罩会直接错位。所以发布面板要 portal 到 Showcase 提供的
 * 第二个 `.ssp-scope`（`portalRoot`），与 `ProjectModal` 同一个落点。
 *
 * 与 showcase 输入路由的关系（重要，改之前先读 `useWheelNavigation.ts`）：
 *   · 键盘：`onKeyDown` 已跳过 INPUT / TEXTAREA / contentEditable → 打字不会切场景 ✓
 *   · 触摸：`INTERACTIVE` 已含 textarea → 触摸输入区不算切场景手势 ✓
 *   · 滚轮：焦点在本面板内时**完全不翻页**（`isEditorFocused` 早于 `findScrollable`），
 *     编辑区自身滚动靠 `.editor-textarea` / `.editor-preview` 显式的 `overflow-y: auto`。
 */

import { useEffect, useMemo, useRef, useState, type ChangeEvent } from "react";
import { createPortal } from "react-dom";
import { useNavigate, useSearchParams } from "react-router-dom";
import {
  Bold, Italic, Code2, Quote, List, ListOrdered, Link2,
  Image as ImageIcon, Eye, Edit3, Columns2, Check,
  Save, Upload, X, Hash, Plus, Loader2,
  type LucideIcon,
} from "lucide-react";
import { toast } from "sonner";
import { postsApi, tagsApi, uploadApi } from "../../lib/api";
import { useAuth } from "../../components/auth/AuthProvider";
import { renderMarkdown } from "../lib/markdown";

interface ToolItem {
  icon: LucideIcon;
  label: string;
  /** 插入的 Markdown 片段；wrap=true 时包裹选中文字（如 **粗体**） */
  action: string;
  wrap: boolean;
  /** kind="upload-image"：点击后先选文件上传，成功后把返回 URL 插入光标处 */
  kind?: "upload-image";
}

/** 工具栏：与 Write.tsx 的 toolbarItems 一一对应（图片改为走上传接口） */
const TOOLS: ToolItem[] = [
  { icon: Bold, label: "粗体", action: "**", wrap: true },
  { icon: Italic, label: "斜体", action: "*", wrap: true },
  { icon: Code2, label: "代码", action: "`", wrap: true },
  { icon: Quote, label: "引用", action: "> ", wrap: false },
  { icon: List, label: "无序列表", action: "- ", wrap: false },
  { icon: ListOrdered, label: "有序列表", action: "1. ", wrap: false },
  { icon: Link2, label: "链接", action: "[文字](url)", wrap: false },
  { icon: ImageIcon, label: "上传图片", action: "", wrap: false, kind: "upload-image" },
];

const HEADINGS = ["H1", "H2", "H3"] as const;

const MODES = [
  { mode: "edit", icon: Edit3, label: "编辑" },
  { mode: "split", icon: Columns2, label: "分屏" },
  { mode: "preview", icon: Eye, label: "预览" },
] as const;

type Mode = (typeof MODES)[number]["mode"];

const DRAFT_KEY = "showcase-editor-draft";

/** 标签兜底：与 Write.tsx 的 DEFAULT_TAGS 一致，接口挂了也不至于没得选 */
const DEFAULT_TAGS = ["React", "TypeScript", "CSS", "设计", "前端", "后端", "AI", "架构", "工程化", "职场"];

const VISIBILITY = [
  { value: "public", label: "公开" },
  { value: "private", label: "仅自己可见" },
  { value: "members", label: "仅会员可见" },
] as const;

const MAX_TAGS = 5;

const DEFAULT_MD = `# 开始写作

在这里输入内容，右侧实时预览。

## 支持的语法

- 标题（H1 / H2 / H3）
- **粗体**、*斜体*、\`行内代码\`
- 有序 / 无序列表
- [链接](https://example.com)

> 引用块单独成行，不能写进列表项里。

围栏代码块：

\`\`\`
const hello = "world";
\`\`\`
`;

interface Draft {
  title: string;
  content: string;
  savedAt: number;
}

function readDraft(): Draft | null {
  try {
    const raw = localStorage.getItem(DRAFT_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<Draft>;
    if (typeof parsed.title !== "string" || typeof parsed.content !== "string") return null;
    return { title: parsed.title, content: parsed.content, savedAt: parsed.savedAt ?? 0 };
  } catch {
    /* 隐私模式 / 脏数据：当作没有草稿，不要抛 */
    return null;
  }
}

/* Markdown 渲染已抽到 `lib/markdown.tsx` —— 场景 2 的阅读弹窗要用同一套，
   两份实现迟早会走偏。 */

/* ================================================================== */

interface SceneEditorProps {
  /** 发布面板的 portal 落点（Showcase 的第二个 .ssp-scope）。
      为 null 时面板不渲染 —— 面板是 fixed，留在轨道里会错位。 */
  portalRoot?: HTMLDivElement | null;
  /** 发布成功后通知外层（场景 2 的文章列表要刷新） */
  onPublished?: () => void;
  /** 面板开关通知外层：打开期间要屏蔽场景导航（走 `api.setDetailOpen`） */
  onPublishPanelToggle?: (open: boolean) => void;
}

const SceneEditor = ({ portalRoot, onPublished, onPublishPanelToggle }: SceneEditorProps) => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { isLoggedIn } = useAuth();

  /* 编辑已有文章：与 Write.tsx 一致，读 ?edit=<id> */
  const editId = useMemo(() => {
    const raw = searchParams.get("edit");
    const n = raw ? Number(raw) : NaN;
    return Number.isFinite(n) && n > 0 ? n : null;
  }, [searchParams]);

  /* 惰性初始化：直接从 localStorage 读，避免首帧闪一下默认内容再被覆盖 */
  const [initial] = useState(() => readDraft());
  const [title, setTitle] = useState(() => initial?.title ?? "");
  const [content, setContent] = useState(() => initial?.content ?? DEFAULT_MD);
  const [mode, setMode] = useState<Mode>("split");
  const [saved, setSaved] = useState(true);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  /* ---- 发布相关状态（对齐 Write.tsx） ---- */
  const [allTags, setAllTags] = useState<string[]>(DEFAULT_TAGS);
  const [selectedTags, setSelectedTags] = useState<string[]>([]);
  const [newTag, setNewTag] = useState("");
  const [showTagInput, setShowTagInput] = useState(false);
  const [coverUrl, setCoverUrl] = useState("");
  const [summary, setSummary] = useState("");
  const [visibility, setVisibility] = useState<string>("public");
  const [showPublish, setShowPublish] = useState(false);
  const [saving, setSaving] = useState(false);

  /* 标签：进入时拉一次后端，失败保留兜底列表 */
  useEffect(() => {
    tagsApi
      .list()
      .then((tags) => {
        const names = tags.map((t) => t.name).filter(Boolean);
        if (names.length > 0) setAllTags(names);
      })
      .catch(() => {
        /* 接口挂了就继续用 DEFAULT_TAGS */
      });
  }, []);

  /* 编辑模式：拉已有文章填充表单 */
  useEffect(() => {
    if (!editId) return;
    postsApi
      .get(editId)
      .then((post) => {
        if (!post) return;
        setTitle(post.title || "");
        setContent(post.content_md || "");
        setSelectedTags(post.tags ?? []);
        setSummary(post.summary ?? "");
        setVisibility(post.status === "draft" ? "draft" : "public");
        if (post.cover) setCoverUrl(post.cover);
      })
      .catch(() => toast.error("加载文章失败"));
  }, [editId]);

  /* 本地自动保存：debounce 700ms。
     这是**兜底**，不替代后端保存 —— 滚轮切场景时用户随时会滑走，只有手动保存不够稳。 */
  useEffect(() => {
    setSaved(false);
    const id = setTimeout(() => {
      try {
        localStorage.setItem(
          DRAFT_KEY,
          JSON.stringify({ title, content, savedAt: Date.now() } satisfies Draft),
        );
      } catch {
        /* 配额满 / 隐私模式：静默失败，不能让保存拖垮编辑 */
      }
      setSaved(true);
    }, 700);
    return () => clearTimeout(id);
  }, [title, content]);

  /* 字数统计与阅读时间（500 字/分钟），与 Write.tsx 一致 */
  const wordCount = useMemo(() => content.replace(/\s+/g, "").length, [content]);
  const readTime = Math.max(1, Math.ceil(wordCount / 500));

  /** 工具栏插入：wrap 且有选区时包裹选中文字，否则在光标处插入语法 */
  const insert = (item: ToolItem) => {
    // @cuiruoni+图片工具 → 走上传接口：选文件 → POST /api/upload/image → 插入返回的 URL
    if (item.kind === "upload-image") {
      openFilePicker("insert");
      return;
    }
    const ta = textareaRef.current;
    if (!ta) return;
    const start = ta.selectionStart;
    const end = ta.selectionEnd;
    const selected = content.slice(start, end);
    const next =
      item.wrap && selected
        ? content.slice(0, start) + item.action + selected + item.action + content.slice(end)
        : content.slice(0, start) + item.action + content.slice(end);
    setContent(next);
    // 等 React 把新值刷进 DOM 再改光标，否则会被 revert
    setTimeout(() => {
      ta.focus();
      const pos = start + item.action.length + (item.wrap && selected ? selected.length : 0);
      ta.setSelectionRange(pos, pos);
    }, 0);
  };

  /* ---------------- 图片上传（封面 + 正文插图共用一个隐藏 input） ---------------- */
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const uploadTargetRef = useRef<"cover" | "insert" | null>(null);
  const [uploading, setUploading] = useState(false);

  const openFilePicker = (target: "cover" | "insert") => {
    if (uploading) return;
    uploadTargetRef.current = target;
    fileInputRef.current?.click();
  };

  const handleFileChosen = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = ""; // @cuiruoni+清空以便下次能重复选择同一文件
    const target = uploadTargetRef.current;
    uploadTargetRef.current = null;
    if (!file || !target) return;
    setUploading(true);
    try {
      const url = await uploadApi.image(file);
      if (target === "cover") {
        setCoverUrl(url);
        toast.success("封面上传成功");
      } else {
        insertSnippet(`![${file.name.replace(/\.[^.]+$/, "")}](${url})`);
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "上传失败");
    } finally {
      setUploading(false);
    }
  };

  /** 在光标处插入任意 Markdown 片段（与 insert 同一套光标恢复逻辑） */
  const insertSnippet = (snippet: string) => {
    const ta = textareaRef.current;
    if (!ta) {
      setContent((prev) => `${prev}\n${snippet}\n`);
      return;
    }
    const start = ta.selectionStart;
    const end = ta.selectionEnd;
    setContent(content.slice(0, start) + snippet + content.slice(end));
    setTimeout(() => {
      ta.focus();
      const pos = start + snippet.length;
      ta.setSelectionRange(pos, pos);
    }, 0);
  };

  const insertHeading = (h: (typeof HEADINGS)[number]) => {
    const prefix = "#".repeat(Number(h[1])) + " ";
    const ta = textareaRef.current;
    const at = content.length;
    setContent((prev) => `${prev}\n${prefix}标题\n`);
    setTimeout(() => {
      ta?.focus();
      ta?.setSelectionRange(at + prefix.length + 1, at + prefix.length + 3);
    }, 0);
  };

  const toggleTag = (tag: string) => {
    setSelectedTags((prev) =>
      prev.includes(tag) ? prev.filter((t) => t !== tag) : prev.length < MAX_TAGS ? [...prev, tag] : prev,
    );
  };

  const addCustomTag = () => {
    const v = newTag.trim();
    if (v && !selectedTags.includes(v) && selectedTags.length < MAX_TAGS) {
      setSelectedTags((prev) => [...prev, v]);
      setNewTag("");
      setShowTagInput(false);
    }
  };

  /** 写后端。未登录时引导去登录 —— 与 Write.tsx 同一套提示。 */
  const savePost = async (status: "draft" | "published") => {
    if (!isLoggedIn) {
      toast.error("请先登录");
      navigate("/login");
      return null;
    }
    if (!title.trim()) {
      toast.error("请填写文章标题");
      return null;
    }
    setSaving(true);
    try {
      const data = {
        title: title.trim(),
        content_md: content,
        summary: summary.trim(),
        status,
        tags: selectedTags,
        visibility,
        cover: coverUrl || undefined,
      };
      return editId ? await postsApi.update(editId, data) : await postsApi.create(data);
    } catch {
      toast.error("保存失败，请稍后重试");
      return null;
    } finally {
      setSaving(false);
    }
  };

  const handleSaveDraft = async () => {
    const post = await savePost("draft");
    if (post) toast.success("草稿已保存到服务器");
  };

  /** 关面板 → 同时解除导航屏蔽，两处都要调（成功发布、手动关闭） */
  const closePublish = () => {
    setShowPublish(false);
    onPublishPanelToggle?.(false);
  };

  const handlePublish = async () => {
    if (!title.trim()) {
      toast.error("请填写文章标题");
      return;
    }
    if (content.length < 100) {
      toast.error("文章内容太短了");
      return;
    }
    const post = await savePost("published");
    if (!post) return;
    toast.success(editId ? "文章更新成功！" : "文章发布成功！");
    closePublish();
    onPublished?.();
  };

  const openPublish = () => {
    if (!isLoggedIn) {
      toast.error("请先登录");
      navigate("/login");
      return;
    }
    if (!title.trim()) {
      toast.error("请填写文章标题");
      return;
    }
    setShowPublish(true);
    onPublishPanelToggle?.(true);
  };

  const preview = useMemo(() => renderMarkdown(content), [content]);

  /* Esc 关闭发布面板。注意场景导航的 keydown 只认方向键 / Home / Enter，
     两者不会抢同一个键。 */
  useEffect(() => {
    if (!showPublish) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") closePublish();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showPublish]);

  /* ---------------- 发布面板（portal） ---------------- */
  const publishPanel = (
    <div
      className={"editor-publish" + (showPublish ? " is-open" : "")}
      role="dialog"
      aria-modal="true"
      aria-label="发布文章"
      onWheel={(e) => e.stopPropagation()}
      onTouchMove={(e) => e.stopPropagation()}
      onClick={(e) => {
        if (e.target === e.currentTarget) closePublish();
      }}
    >
      <div className="editor-publish-card">
        <div className="editor-publish-head">
          <h3>{editId ? "编辑文章" : "发布文章"}</h3>
          <button type="button" className="editor-publish-close" aria-label="关闭" onClick={closePublish}>
            <X size={18} />
          </button>
        </div>

        <div className="editor-publish-body">
          <div className="editor-field">
            <label>封面图</label>
            <div className={"editor-cover" + (coverUrl ? " has-image" : "")}>
              {coverUrl ? (
                <img src={coverUrl} alt="" />
              ) : (
                <span className="editor-cover-empty">
                  <ImageIcon size={20} />
                  未设置封面
                </span>
              )}
            </div>
            <input
              type="text"
              className="editor-input"
              placeholder="输入封面图 URL…"
              value={coverUrl}
              onChange={(e) => setCoverUrl(e.target.value)}
            />
            {/* @cuiruoni+本地上传封面 → /api/upload/image，成功后回填 URL */}
            <button
              type="button"
              className="editor-link-btn"
              onClick={() => openFilePicker("cover")}
              disabled={uploading}
            >
              {uploading ? <Loader2 size={12} className="editor-spin" /> : <ImageIcon size={12} />}
              {uploading ? "上传中…" : "上传本地图片"}
            </button>
          </div>

          <div className="editor-field">
            <label className="editor-label-row">
              <Hash size={13} />
              标签（{selectedTags.length}/{MAX_TAGS}）
            </label>
            <div className="editor-tags">
              {allTags.map((tag) => (
                <button
                  key={tag}
                  type="button"
                  className={"editor-tag" + (selectedTags.includes(tag) ? " is-on" : "")}
                  onClick={() => toggleTag(tag)}
                >
                  {tag}
                </button>
              ))}
            </div>
            {showTagInput ? (
              <div className="editor-tag-add">
                <input
                  type="text"
                  className="editor-input"
                  placeholder="自定义标签"
                  value={newTag}
                  onChange={(e) => setNewTag(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && addCustomTag()}
                />
                <button type="button" className="editor-btn editor-btn-primary" onClick={addCustomTag}>
                  添加
                </button>
              </div>
            ) : (
              <button type="button" className="editor-link-btn" onClick={() => setShowTagInput(true)}>
                <Plus size={12} />
                自定义标签
              </button>
            )}
          </div>

          <div className="editor-field">
            <label>文章摘要</label>
            <textarea
              className="editor-input editor-textarea-sm"
              rows={3}
              placeholder="简短描述这篇文章的主要内容…"
              value={summary}
              onChange={(e) => setSummary(e.target.value)}
            />
          </div>

          <div className="editor-field">
            <label>可见性</label>
            <select className="editor-input" value={visibility} onChange={(e) => setVisibility(e.target.value)}>
              {VISIBILITY.map((v) => (
                <option key={v.value} value={v.value}>
                  {v.label}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="editor-publish-foot">
          <button type="button" className="editor-btn" onClick={handleSaveDraft} disabled={saving}>
            {saving ? "保存中…" : "保存草稿"}
          </button>
          <button type="button" className="editor-btn editor-btn-primary" onClick={handlePublish} disabled={saving}>
            {saving ? "发布中…" : editId ? "更新文章" : "立即发布"}
          </button>
        </div>
      </div>
    </div>
  );

  return (
    <section className="page page-editor" data-mode={mode} aria-label="Markdown 编辑器">
      {/* @cuiruoni+隐藏的图片选择框：封面 / 正文插图共用，目标由 uploadTargetRef 决定 */}
      <input
        ref={fileInputRef}
        type="file"
        accept="image/png,image/jpeg,image/webp,image/gif,image/bmp"
        className="hidden"
        onChange={handleFileChosen}
      />
      <header className="editor-head">
        <div className="editor-head-copy">
          <p className="eyebrow">Markdown / Editor</p>
          <h2 className="editor-heading">{editId ? "编辑文章" : "写点什么"}</h2>
          <p className="editor-head-note">
            左边写 Markdown，右边即时预览。写完后点「发布」直接发到博客，标签、封面、摘要都在发布面板里。
            {isLoggedIn ? "" : "（发布需要先登录）"}
          </p>
        </div>
      </header>

      <div className="editor-shell">
        {/* ---------- 工具条 ---------- */}
        <div className="editor-bar">
          {TOOLS.map((t) => (
            <button
              key={t.label}
              type="button"
              className="editor-tool"
              title={t.label}
              aria-label={t.label}
              onClick={() => insert(t)}
            >
              <t.icon size={15} />
            </button>
          ))}

          <span className="editor-divider" />

          {HEADINGS.map((h) => (
            <button
              key={h}
              type="button"
              className="editor-tool editor-tool-wide"
              title={`插入 ${h} 标题`}
              onClick={() => insertHeading(h)}
            >
              {h}
            </button>
          ))}

          <span className="editor-bar-spacer" />

          <div className="editor-modes" role="group" aria-label="视图模式">
            {MODES.map((m) => (
              <button
                key={m.mode}
                type="button"
                className={
                  "editor-mode" +
                  (mode === m.mode ? " is-active" : "") +
                  (m.mode === "split" ? " editor-mode-split" : "")
                }
                aria-pressed={mode === m.mode}
                onClick={() => setMode(m.mode)}
              >
                <m.icon size={12} />
                <span>{m.label}</span>
              </button>
            ))}
          </div>

          <span className="editor-divider" />

          <button
            type="button"
            className="editor-act"
            onClick={handleSaveDraft}
            disabled={saving}
            title="保存草稿到服务器"
          >
            {saving ? <Loader2 size={13} className="editor-spin" /> : <Save size={13} />}
            <span>存草稿</span>
          </button>
          <button type="button" className="editor-act editor-act-primary" onClick={openPublish} disabled={saving}>
            <Upload size={13} />
            <span>{editId ? "更新" : "发布"}</span>
          </button>
        </div>

        {/* ---------- 编辑 / 预览 ---------- */}
        <div className="editor-body">
          <div className="editor-pane editor-pane-write">
            <input
              type="text"
              className="editor-title"
              placeholder="文章标题…"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              spellCheck={false}
            />
            <textarea
              ref={textareaRef}
              className="editor-textarea"
              value={content}
              onChange={(e) => setContent(e.target.value)}
              placeholder="在这里开始写作…"
              spellCheck={false}
              aria-label="Markdown 内容"
            />
          </div>

          <div className="editor-pane editor-pane-preview">
            <div className="editor-preview">
              <h1 className={title ? undefined : "md-untitled"}>{title || "（无标题）"}</h1>
              {preview}
            </div>
          </div>
        </div>

        {/* ---------- 底部信息 ---------- */}
        <div className="editor-foot">
          <span>
            {wordCount} 字 · 约 {readTime} 分钟
          </span>
          <span className={"editor-status" + (saved ? " is-saved" : "")} aria-live="polite">
            <span className="editor-status-dot" />
            {saved ? (
              <>
                <Check size={12} /> 草稿已存本地
              </>
            ) : (
              "保存中…"
            )}
          </span>
          {selectedTags.length > 0 && <span className="editor-foot-tags">标签：{selectedTags.join(" / ")}</span>}
          {/* 行为说明要跟着规则走 —— 规则改成「黑框内只滚文章」后，
              旧文案「编辑时滚轮不翻页」就成了错误信息（它会让人以为必须聚焦才不翻页）。 */}
          <span className="editor-foot-hint">框内滚动只翻文章 · 移到框外滚动才切场景</span>
        </div>
      </div>

      {portalRoot && createPortal(publishPanel, portalRoot)}
    </section>
  );
};

export default SceneEditor;
