import { useState, useRef, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import {
  Bold, Italic, Code2, List, ListOrdered, Quote,
  Link2, Image, Eye, Edit3, Save, Upload,
  Hash, Plus, X, ChevronDown, Maximize2
} from "lucide-react";
import GlassBackground from "../components/GlassBackground";
import Navbar from "../components/Navbar";
import { toast } from "sonner";
import { postsApi, tagsApi } from "../lib/api";

// @cuiruoni+Markdown编辑器工具栏配置：定义每个工具按钮的图标、标签、插入语法和是否包裹选中文字
const toolbarItems = [
  { icon: Bold, label: `粗体`, action: `**`, wrap: true },
  { icon: Italic, label: `斜体`, action: `*`, wrap: true },
  { icon: Code2, label: `代码`, action: "`", wrap: true },
  { icon: Quote, label: `引用`, action: `> `, wrap: false },
  { icon: List, label: `无序列表`, action: `- `, wrap: false },
  { icon: ListOrdered, label: `有序列表`, action: `1. `, wrap: false },
  { icon: Link2, label: `链接`, action: `[文字](url)`, wrap: false },
  { icon: Image, label: `图片`, action: `![描述](url)`, wrap: false },
];

// @cuiruoni+标签从后端API获取，不再硬编码
const DEFAULT_TAGS = [`React`, `TypeScript`, `CSS`, `设计`, `前端`, `后端`, `AI`, `架构`, `工程化`, `职场`];

// @cuiruoni+写作页组件：Markdown编辑器+分屏预览+发布面板，支持工具栏插入、标签选择、草稿保存
const Write = () => {
  const navigate = useNavigate();
  const [allTags, setAllTags] = useState<string[]>(DEFAULT_TAGS);

  useEffect(() => {
    // @cuiruoni+从/api/tags获取标签列表
    tagsApi.list().then((res) => {
      if (res?.data) {
        const tagNames = res.data.map((t: { id?: number; name: string }) => t.name);
        if (tagNames.length > 0) setAllTags(tagNames);
      }
    }).catch(() => {
      // @cuiruoni+API失败时保留默认标签
    });
  }, []);
  const [title, setTitle] = useState(``);
  const [content, setContent] = useState(`# 开始写作\n\n在这里输入你的文章内容...\n\n## 小节标题\n\n正文内容。`);
  // @cuiruoni+三种预览模式：edit(纯编辑)、split(分屏)、preview(纯预览)
  const [previewMode, setPreviewMode] = useState<`split` | `edit` | `preview`>(`split`);
  const [selectedTags, setSelectedTags] = useState<string[]>([]);
  const [newTag, setNewTag] = useState(``);
  const [showTagInput, setShowTagInput] = useState(false);
  // @cuiruoni+发布面板：右侧滑出式面板，包含封面图、标签、摘要、可见性设置
  const [showPublishPanel, setShowPublishPanel] = useState(false);
  const [coverUrl, setCoverUrl] = useState(``);
  const [summary, setSummary] = useState(``);
  const [saving, setSaving] = useState(false);
  const [isLoggedIn] = useState(() => !!localStorage.getItem(`blog_logged_in`));
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // @cuiruoni+字数统计和阅读时间估算（按500字/分钟计算）
  const wordCount = content.replace(/\s+/g, ``).length;
  const readTime = Math.max(1, Math.ceil(wordCount / 500));

  // @cuiruoni+工具栏插入逻辑：wrap模式包裹选中文字，非wrap模式在光标处插入语法
  const insertText = (item: typeof toolbarItems[0]) => {
    const ta = textareaRef.current;
    if (!ta) return;
    const start = ta.selectionStart;
    const end = ta.selectionEnd;
    const selected = content.slice(start, end);
    let newContent: string;
    if (item.wrap && selected) {
      newContent = content.slice(0, start) + item.action + selected + item.action + content.slice(end);
    } else {
      newContent = content.slice(0, start) + item.action + content.slice(end);
    }
    setContent(newContent);
    setTimeout(() => {
      ta.focus();
      ta.setSelectionRange(start + item.action.length, start + item.action.length);
    }, 0);
  };

  // @cuiruoni+标签切换：最多选5个标签，已选则取消，未选则添加
  const toggleTag = (tag: string) => {
    setSelectedTags((prev) =>
      prev.includes(tag) ? prev.filter((t) => t !== tag) : prev.length < 5 ? [...prev, tag] : prev
    );
  };

  const addCustomTag = () => {
    if (newTag.trim() && !selectedTags.includes(newTag.trim()) && selectedTags.length < 5) {
      setSelectedTags((prev) => [...prev, newTag.trim()]);
      setNewTag(``);
      setShowTagInput(false);
    }
  };

  const savePost = async (status: "draft" | "published") => {
    if (!isLoggedIn) {
      toast.error(`请先登录`);
      navigate(`/login`);
      return null;
    }
    if (!title.trim()) {
      toast.error(`请填写文章标题`);
      return null;
    }

    setSaving(true);
    try {
      return await postsApi.create({
        title: title.trim(),
        content_md: content,
        summary: summary.trim(),
        status,
        tags: selectedTags,
      });
    } finally {
      setSaving(false);
    }
  };

  const handleSaveDraft = async () => {
    const post = await savePost("draft");
    if (post) toast.success(`草稿已保存！`);
  };

  // @cuiruoni+发布校验：标题必填、内容至少100字，通过后toast提示并跳转首页
  const handlePublish = async () => {
    if (!title.trim()) { toast.error(`请填写文章标题`); return; }
    if (content.length < 100) { toast.error(`文章内容太短了`); return; }
    const post = await savePost("published");
    if (!post) {
      toast.error(`发布失败，请稍后重试`);
      return;
    }
    toast.success(`文章发布成功！`);
    setTimeout(() => navigate(`/post?id=${post.id}`), 1200);
  };

  // @cuiruoni+简易Markdown渲染：按行解析标题/引用/列表/代码块等语法，不依赖第三方库
  const renderPreview = (md: string) => {
    const lines = md.split(`\n`);
    return lines.map((line, i) => {
      if (line.startsWith(`# `)) return <h1 key={i} className="text-3xl font-black text-foreground mb-3 mt-6">{line.slice(2)}</h1>;
      if (line.startsWith(`## `)) return <h2 key={i} className="text-2xl font-bold text-foreground mb-3 mt-6">{line.slice(3)}</h2>;
      if (line.startsWith(`### `)) return <h3 key={i} className="text-lg font-bold mb-2 mt-4" style={{ color: `#c4b5fd` }}>{line.slice(4)}</h3>;
      if (line.startsWith(`> `)) return (
        <blockquote key={i} className="my-3 pl-4 py-2 italic text-sm" style={{ borderLeft: `3px solid #7c6aff`, background: `rgba(124,106,255,0.07)`, borderRadius: `0 0.5rem 0.5rem 0`, color: `rgba(232,234,246,0.75)` }}>
          {line.slice(2)}
        </blockquote>
      );
      if (line.startsWith(`- `)) return <li key={i} className="text-sm mb-1 ml-4" style={{ color: `rgba(232,234,246,0.8)` }}>{line.slice(2)}</li>;
      if (line.trim() === ``) return <div key={i} className="h-3" />;
      return <p key={i} className="text-sm leading-relaxed mb-1" style={{ color: `rgba(232,234,246,0.8)` }}>{line}</p>;
    });
  };

  const handleLogout = () => {
    localStorage.removeItem(`blog_logged_in`);
    navigate(`/login`);
  };

  return (
    <div data-cmp="Write" className="min-h-screen relative">
      <GlassBackground showParticles={false} />
      <Navbar isLoggedIn={isLoggedIn} onLogout={handleLogout} onLogin={() => navigate(`/login`)} />

      <div className="relative z-10 flex flex-col" style={{ paddingTop: 64, height: `100vh` }}>
        {/* Write toolbar */}
        <div
          className="flex-shrink-0 flex items-center justify-between px-6 py-3"
          style={{
            background: `rgba(5,8,22,0.8)`,
            backdropFilter: `blur(20px)`,
            borderBottom: `1px solid rgba(255,255,255,0.06)`,
          }}
        >
          <div className="flex items-center gap-2 flex-wrap">
            {toolbarItems.map((item, i) => (
              <button
                key={i}
                onClick={() => insertText(item)}
                title={item.label}
                className="w-8 h-8 rounded-lg flex items-center justify-center transition-all hover:bg-white/10"
                style={{ color: `rgba(232,234,246,0.6)` }}
              >
                <item.icon size={15} />
              </button>
            ))}
            <div className="w-px h-5 mx-1" style={{ background: `rgba(255,255,255,0.08)` }} />
            {[`H1`, `H2`, `H3`].map((h) => (
              <button
                key={h}
                onClick={() => {
                  const prefix = `#`.repeat(Number(h[1])) + ` `;
                  setContent((prev) => prev + `\n${prefix}标题\n`);
                }}
                className="px-2 h-8 rounded-lg text-xs font-mono transition-all hover:bg-white/10"
                style={{ color: `rgba(232,234,246,0.6)` }}
              >
                {h}
              </button>
            ))}
          </div>

          <div className="flex items-center gap-3">
            {/* View mode */}
            <div className="flex items-center gap-1 p-1 rounded-xl" style={{ background: `rgba(255,255,255,0.05)` }}>
              {[
                { mode: `edit` as const, icon: Edit3, label: `编辑` },
                { mode: `split` as const, icon: Maximize2, label: `分屏` },
                { mode: `preview` as const, icon: Eye, label: `预览` },
              ].map((v) => (
                <button
                  key={v.mode}
                  onClick={() => setPreviewMode(v.mode)}
                  className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs transition-all"
                  style={{
                    background: previewMode === v.mode ? `rgba(124,106,255,0.2)` : `transparent`,
                    color: previewMode === v.mode ? `#a78bfa` : `rgba(232,234,246,0.5)`,
                  }}
                >
                  <v.icon size={12} />
                  <span className="hidden sm:inline">{v.label}</span>
                </button>
              ))}
            </div>

            <div className="text-xs" style={{ color: `rgba(232,234,246,0.3)` }}>
              {wordCount} 字 · {readTime} min
            </div>

            <button
              onClick={handleSaveDraft}
              disabled={saving}
              className="btn-ghost-glass flex items-center gap-2 px-4 py-2 rounded-xl text-sm text-foreground"
              style={{ opacity: saving ? 0.65 : 1 }}
            >
              <Save size={14} />
              <span className={saving ? `hidden` : ``}>保存草稿</span>
              <span className={saving ? `` : `hidden`}>保存中...</span>
            </button>

            <button
              onClick={() => setShowPublishPanel(true)}
              className="btn-primary-glass flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold"
            >
              <Upload size={14} />
              发布文章
            </button>
          </div>
        </div>

        {/* Editor area */}
        <div className="flex-1 flex overflow-hidden">
          {/* Editor panel */}
          <div
            className="flex flex-col overflow-hidden"
            style={{
              width: previewMode === `split` ? `50%` : previewMode === `edit` ? `100%` : `0%`,
              transition: `width 0.3s ease`,
              borderRight: previewMode === `split` ? `1px solid rgba(255,255,255,0.06)` : `none`,
            }}
          >
            {/* Title input */}
            <div className="px-8 pt-8 pb-4" style={{ borderBottom: `1px solid rgba(255,255,255,0.05)` }}>
              <input
                type="text"
                placeholder="✨ 输入文章标题..."
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                className="w-full bg-transparent text-3xl font-black text-foreground outline-none"
                style={{ color: `#e8eaf6`, caretColor: `#7c6aff` }}
              />
            </div>
            {/* Content textarea */}
            <textarea
              ref={textareaRef}
              value={content}
              onChange={(e) => setContent(e.target.value)}
              className="flex-1 w-full bg-transparent outline-none resize-none px-8 py-6 text-sm font-mono leading-relaxed"
              style={{
                color: `rgba(232,234,246,0.8)`,
                caretColor: `#7c6aff`,
                scrollbarWidth: `thin`,
              }}
              placeholder="在这里开始写作..."
            />
          </div>

          {/* Preview panel */}
          <div
            className="overflow-y-auto"
            style={{
              width: previewMode === `split` ? `50%` : previewMode === `preview` ? `100%` : `0%`,
              transition: `width 0.3s ease`,
              padding: previewMode !== `edit` ? `2rem 3rem` : 0,
            }}
          >
            <div className={previewMode === `edit` ? `hidden` : ``}>
              <div className="text-3xl font-black text-foreground mb-6">
                {title || `（无标题）`}
              </div>
              {renderPreview(content)}
            </div>
          </div>
        </div>
      </div>

      {/* Publish panel overlay */}
      <div
        className="fixed inset-0 flex items-end justify-end"
        style={{
          zIndex: 200,
          opacity: showPublishPanel ? 1 : 0,
          pointerEvents: showPublishPanel ? `auto` : `none`,
          transition: `opacity 0.3s`,
          background: `rgba(0,0,0,${showPublishPanel ? 0.5 : 0})`,
        }}
        onClick={() => setShowPublishPanel(false)}
      >
        <div
          className="overflow-y-auto"
          style={{
            width: 400,
            height: `100vh`,
            background: `rgba(10,12,30,0.95)`,
            backdropFilter: `blur(30px)`,
            borderLeft: `1px solid rgba(255,255,255,0.08)`,
            padding: `2rem`,
            transform: showPublishPanel ? `translateX(0)` : `translateX(100%)`,
            transition: `transform 0.3s cubic-bezier(0.16, 1, 0.3, 1)`,
          }}
          onClick={(e) => e.stopPropagation()}
        >
          <div className="flex items-center justify-between mb-6">
            <h3 className="text-lg font-bold text-foreground">发布文章</h3>
            <button onClick={() => setShowPublishPanel(false)}>
              <X size={18} style={{ color: `rgba(232,234,246,0.5)` }} />
            </button>
          </div>

          {/* Cover */}
          <div className="mb-6">
            <label className="text-sm font-medium text-foreground mb-2 block">封面图</label>
            <div
              className="rounded-xl overflow-hidden mb-2 flex items-center justify-center"
              style={{
                height: 160,
                background: coverUrl ? `transparent` : `rgba(255,255,255,0.04)`,
                border: `1px dashed rgba(124,106,255,0.3)`,
              }}
            >
              <div className={coverUrl ? `hidden` : `text-center`}>
                <Image size={24} style={{ color: `rgba(232,234,246,0.3)`, margin: `0 auto 8px` }} />
                <p className="text-xs" style={{ color: `rgba(232,234,246,0.35)` }}>点击上传或输入图片链接</p>
              </div>
              <img src={coverUrl} alt="" className={coverUrl ? `w-full h-full object-cover` : `hidden`} />
            </div>
            <input
              type="text"
              placeholder="输入封面图 URL..."
              value={coverUrl}
              onChange={(e) => setCoverUrl(e.target.value)}
              className="glass-input w-full px-4 py-3 rounded-xl text-sm"
            />
          </div>

          {/* Tags */}
          <div className="mb-6">
            <label className="text-sm font-medium text-foreground mb-2 block flex items-center gap-2">
              <Hash size={14} style={{ color: `#7c6aff` }} />
              标签 ({selectedTags.length}/5)
            </label>
            <div className="flex flex-wrap gap-2 mb-3">
              {allTags.map((tag) => (
                <button
                  key={tag}
                  onClick={() => toggleTag(tag)}
                  className="px-3 py-1.5 rounded-xl text-xs transition-all"
                  style={{
                    background: selectedTags.includes(tag) ? `rgba(124,106,255,0.2)` : `rgba(255,255,255,0.05)`,
                    color: selectedTags.includes(tag) ? `#a78bfa` : `rgba(232,234,246,0.6)`,
                    border: `1px solid ${selectedTags.includes(tag) ? `rgba(124,106,255,0.35)` : `rgba(255,255,255,0.07)`}`,
                  }}
                >
                  {tag}
                </button>
              ))}
            </div>

            <div className={showTagInput ? `` : `hidden`}>
              <div className="flex gap-2">
                <input
                  type="text"
                  placeholder="输入自定义标签"
                  value={newTag}
                  onChange={(e) => setNewTag(e.target.value)}
                  onKeyDown={(e) => e.key === `Enter` && addCustomTag()}
                  className="glass-input flex-1 px-3 py-2.5 rounded-xl text-sm"
                />
                <button onClick={addCustomTag} className="btn-primary-glass px-4 rounded-xl text-sm">
                  添加
                </button>
              </div>
            </div>
            <button
              onClick={() => setShowTagInput(!showTagInput)}
              className="flex items-center gap-1 text-xs mt-2"
              style={{ color: `rgba(124,106,255,0.7)` }}
            >
              <Plus size={12} />
              自定义标签
            </button>
          </div>

          {/* Summary */}
          <div className="mb-6">
            <label className="text-sm font-medium text-foreground mb-2 block">文章摘要</label>
            <textarea
              placeholder="简短描述这篇文章的主要内容..."
              value={summary}
              onChange={(e) => setSummary(e.target.value)}
              rows={3}
              className="glass-input w-full px-4 py-3 rounded-xl text-sm resize-none"
            />
          </div>

          {/* Visibility */}
          <div className="mb-8">
            <label className="text-sm font-medium text-foreground mb-2 block">可见性</label>
            <div className="relative">
              <select
                className="glass-input w-full px-4 py-3 rounded-xl text-sm appearance-none"
                style={{ color: `rgba(232,234,246,0.8)`, background: `transparent` }}
              >
                <option value="public" style={{ background: `#0a0c1e` }}>公开</option>
                <option value="private" style={{ background: `#0a0c1e` }}>仅自己可见</option>
                <option value="members" style={{ background: `#0a0c1e` }}>仅会员可见</option>
              </select>
              <ChevronDown size={14} className="absolute right-4 top-1/2 -translate-y-1/2 pointer-events-none" style={{ color: `rgba(232,234,246,0.4)` }} />
            </div>
          </div>

          <div className="flex gap-3">
            <button
              onClick={handleSaveDraft}
              disabled={saving}
              className="btn-ghost-glass flex-1 py-3 rounded-xl text-sm font-medium text-foreground"
              style={{ opacity: saving ? 0.65 : 1 }}
            >
              {saving ? "保存中..." : "保存草稿"}
            </button>
            <button
              onClick={handlePublish}
              disabled={saving}
              className="btn-primary-glass flex-1 py-3 rounded-xl text-sm font-semibold"
              style={{ opacity: saving ? 0.65 : 1 }}
            >
              {saving ? "发布中..." : "立即发布"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Write;
