import { useState, useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import {
  User, Bell, Shield, Palette, Globe,
  ChevronRight, Camera, Check, LogOut, Trash2, Mail, Lock, Eye, EyeOff,
  Image as ImageIcon, Wand2, Loader2, X
} from "lucide-react";
import GlassBackground from "../components/layout/GlassBackground";
import Navbar from "../components/layout/Navbar";
import { useAuth } from "../components/auth/AuthProvider";
import { useTheme } from "../components/theme/ThemeProvider";
import { toast } from "sonner";
import { profileApi, styleApi, backgroundApi, type UserProfile, type StyleOption, type BackgroundSettingInfo } from "../lib/api";
import {
  loadBackground, saveBackground, clearBackground, urlToDataUrl,
  type BackgroundSetting,
} from "../lib/background";
import { uploadImage } from "../lib/uploader";

const settingsSections = [
  { key: `profile`, label: `个人资料`, icon: User },
  { key: `notifications`, label: `通知偏好`, icon: Bell },
  { key: `privacy`, label: `隐私与安全`, icon: Shield },
  { key: `appearance`, label: `外观设置`, icon: Palette },
  { key: `background`, label: `背景设置`, icon: ImageIcon },
  { key: `account`, label: `账号管理`, icon: Globe },
];

const notifOptions = [
  { key: `likes`, label: `点赞通知`, desc: `有人点赞你的文章时通知你` },
  { key: `comments`, label: `评论通知`, desc: `收到新评论时通知你` },
  { key: `follows`, label: `关注通知`, desc: `有新粉丝时通知你` },
  { key: `mentions`, label: `提及通知`, desc: `在评论中被提及时通知你` },
  { key: `newsletter`, label: `每周精选`, desc: `每周推送精选文章摘要` },
];

// @cuiruoni+设置页组件：5个设置分区（资料/通知/隐私/外观/账号），左侧导航+右侧内容布局
const Settings = () => {
  const navigate = useNavigate();
  const { isLoggedIn, logout } = useAuth();
  const [activeSection, setActiveSection] = useState("profile");

  // Profile form - loaded from API
  const [profileLoading, setProfileLoading] = useState(true);
  const [name, setName] = useState(``);
  const [bio, setBio] = useState(``);
  const [location, setLocation] = useState(``);
  const [website, setWebsite] = useState(``);
  const [twitter, setTwitter] = useState(``);
  const [email, setEmail] = useState(``);
  const [savingProfile, setSavingProfile] = useState(false);
  const [avatarUrl, setAvatarUrl] = useState(``);
  const [showAvatarInput, setShowAvatarInput] = useState(false);

  // @cuiruoni+从后端API加载用户资料
  useEffect(() => {
    const loadProfile = async () => {
      setProfileLoading(true);
      try {
        const profile = await profileApi.get();
        // @cuiruoni+P2修复：未登录时接口返回null，直接跳过
        if (!profile) return;
        setName(profile.username);
        setBio(profile.bio);
        setLocation(profile.location);
        setWebsite(profile.website);
        setTwitter(profile.twitter);
        setEmail(profile.email);
        if (profile.avatar) setAvatarUrl(profile.avatar);
      } catch { /* ignore */ }
      setProfileLoading(false);
    };
    loadProfile();
  }, []);

  // Notifications
  // @cuiruoni+通知开关状态：每个通知类型独立控制，从localStorage恢复，默认开启点赞/评论/关注/精选，关闭提及
  const [notifStates, setNotifStates] = useState<Record<string, boolean>>(() => {
    try {
      const saved = localStorage.getItem(`blog_notif_prefs`);
      return saved ? JSON.parse(saved) : { likes: true, comments: true, follows: true, mentions: false, newsletter: true };
    } catch {
      return { likes: true, comments: true, follows: true, mentions: false, newsletter: true };
    }
  });

  // @cuiruoni+P2修复：隐私开关持久化到localStorage
  const [profilePublic, setProfilePublic] = useState(() => localStorage.getItem("blog_privacy_public") !== "0");
  const [showEmail, setShowEmail] = useState(() => localStorage.getItem("blog_privacy_email") === "1");

  useEffect(() => {
    localStorage.setItem("blog_privacy_public", profilePublic ? "1" : "0");
  }, [profilePublic]);

  useEffect(() => {
    localStorage.setItem("blog_privacy_email", showEmail ? "1" : "0");
  }, [showEmail]);

  // Password
  const [showPass, setShowPass] = useState(false);
  const [newPass, setNewPass] = useState(``);

  // @cuiruoni+P2修复：正文字号真实生效并持久化
  const [fontSize, setFontSize] = useState(() => localStorage.getItem("blog_font_size") || "medium");

  useEffect(() => {
    const sizeMap: Record<string, string> = { small: "15px", medium: "16px", large: "18px" };
    document.documentElement.style.fontSize = sizeMap[fontSize] ?? "16px";
    localStorage.setItem("blog_font_size", fontSize);
  }, [fontSize]);

  const handleSaveProfile = async () => {
    setSavingProfile(true);
    try {
      await profileApi.update({ email, bio, avatar: avatarUrl || undefined, location, website, twitter });
      toast.success("个人资料已保存！");
    } catch {
      toast.error("保存失败，请稍后重试");
    } finally {
      setSavingProfile(false);
    }
  };

  const handleSaveNotif = () => {
    localStorage.setItem(`blog_notif_prefs`, JSON.stringify(notifStates));
    toast.success(`通知设置已保存！`);
  };

  // @cuiruoni+密码修改校验：最少6位，通过后调用后端API
  const [oldPass, setOldPass] = useState(``);
  const [changingPass, setChangingPass] = useState(false);

  const handleChangePass = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!oldPass) { toast.error("请输入当前密码"); return; }
    if (newPass.length < 6) { toast.error("密码至少需要6位"); return; }
    setChangingPass(true);
    try {
      await profileApi.changePassword(oldPass, newPass);
      toast.success("密码修改成功！");
      setOldPass("");
      setNewPass("");
    } catch {
      toast.error("密码修改失败，请检查当前密码是否正确");
    } finally {
      setChangingPass(false);
    }
  };

  const handleLogout = async () => {
    await logout();
    navigate("/login");
  };

  // ============ 背景设置（图片只存本机，服务器只留存配置信息） ============
  const [bgSetting, setBgSetting] = useState<BackgroundSetting | null>(() => loadBackground());
  const [bgPreview, setBgPreview] = useState<string | null>(null);
  const [bgStyleId, setBgStyleId] = useState("gathered");
  const [bgGenerating, setBgGenerating] = useState(false);
  const [bgUploadPct, setBgUploadPct] = useState(0);
  const [styles, setStyles] = useState<StyleOption[]>([]);
  const [serverBg, setServerBg] = useState<BackgroundSettingInfo | null>(null);
  const fileRef = useRef<File | null>(null);
  const bgCancelRef = useRef<AbortController | null>(null);

  // @cuiruoni+组件卸载标记：异步轮询/压缩回调据此停止，防止对已卸载组件 setState
  const mountedRef = useRef(true);
  useEffect(() => {
    return () => {
      mountedRef.current = false;
    };
  }, []);

  useEffect(() => {
    styleApi.listStyles().then(setStyles).catch(() => {});
    backgroundApi.get().then((r) => setServerBg(r.background)).catch(() => {});
  }, []);

  const syncBgToServer = async (setting: BackgroundSetting) => {
    try {
      await backgroundApi.save({
        type: setting.type,
        style_id: setting.style_id,
        image_url: setting.image_url,
      });
    } catch {
      toast.error("服务器留存失败（请确认已登录）");
    }
  };

  const applyBg = (setting: BackgroundSetting) => {
    const ok = saveBackground(setting);
    if (!ok) {
      toast.error("本地存储空间不足，无法保存背景");
      return;
    }
    setBgSetting(setting);
    void syncBgToServer(setting);
    toast.success("背景已应用");
  };

  const removeBg = () => {
    clearBackground();
    setBgSetting(null);
    setBgPreview(null);
    void syncBgToServer({ type: "none" });
    toast.success("背景已移除");
  };

  // @cuiruoni+canvas 压缩图片：等比缩放到最长边 1920，并逐步降质至 1.5MB 内，
  // @cuiruoni+避免超出 localStorage 配额（约 5MB）
  const compressImage = (dataUrl: string, mime: string, maxBytes = 1.5 * 1024 * 1024): Promise<string> =>
    new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => {
        const maxDim = 1920;
        let { width, height } = img;
        if (width > maxDim || height > maxDim) {
          const scale = maxDim / Math.max(width, height);
          width = Math.round(width * scale);
          height = Math.round(height * scale);
        }
        const canvas = document.createElement("canvas");
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext("2d");
        if (!ctx) {
          reject(new Error("无法处理图片"));
          return;
        }
        ctx.drawImage(img, 0, 0, width, height);

        // @cuiruoni+检测是否含透明通道（PNG 透明转 JPEG 会变黑，须保留 alpha 格式）
        let hasAlpha = false;
        try {
          const pixel = ctx.getImageData(0, 0, width, height).data;
          for (let i = 3; i < pixel.length; i += 4) {
            if (pixel[i] < 250) {
              hasAlpha = true;
              break;
            }
          }
        } catch {
          hasAlpha = false; // @cuiruoni+跨域等场景读不到像素，按无透明处理
        }

        // @cuiruoni+透明图用 WebP（支持 alpha + 有损压缩），不透明图用 JPEG；
        // @cuiruoni+两者都失败（旧浏览器）时回退 PNG。base64 长度 ≈ 字节数 × 1.34
        const formats: string[] = hasAlpha ? ["image/webp", "image/png"] : ["image/jpeg", "image/png"];
        let out = "";
        for (const fmt of formats) {
          if (out) break;
          let quality = 0.85;
          let candidate = "";
          do {
            try {
              candidate = canvas.toDataURL(fmt, quality);
            } catch {
              candidate = "";
              break; // @cuiruoni+浏览器不支持该编码格式
            }
            if (candidate.startsWith("data:image/")) {
              out = candidate;
            } else {
              candidate = "";
              break;
            }
            quality -= 0.15;
          } while (candidate.length > maxBytes * 1.34 && quality > 0.3);
          if (!out && fmt === "image/png") {
            // @cuiruoni+PNG 为最终回退：仅缩放不降质
            try {
              const png = canvas.toDataURL("image/png");
              if (png.startsWith("data:image/png")) out = png;
            } catch {
              /* ignore */
            }
          }
        }
        resolve(out || dataUrl);
      };
      img.onerror = () => reject(new Error("图片解析失败"));
      img.src = dataUrl;
    });

  const handleBgFile = (file: File | null | undefined) => {
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      toast.error("请选择图片文件");
      return;
    }
    if (file.size > 10 * 1024 * 1024) {
      toast.error("图片不能超过 10MB");
      return;
    }
    fileRef.current = file; // @cuiruoni+保留 File 引用供 AI 风格化分片上传使用
    const reader = new FileReader();
    reader.onload = async () => {
      const dataUrl = reader.result as string;
      try {
        const compressed = await compressImage(dataUrl, file.type);
        setBgPreview(compressed);
      } catch {
        // @cuiruoni+压缩失败退回原图（小图也能直接存下）
        setBgPreview(dataUrl);
      }
    };
    reader.readAsDataURL(file);
  };

  const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

  // @cuiruoni+AI 风格化背景：分片上传（断点续传+进度）→ 生成 → 结果图下载为 dataURL 存本机 → 应用
  const generateBg = async () => {
    if (!fileRef.current) {
      toast.error("请先选择图片");
      return;
    }
    setBgGenerating(true);
    setBgUploadPct(0);
    const controller = new AbortController();
    bgCancelRef.current = controller;
    try {
      const taskId = await uploadImage(fileRef.current, bgStyleId, (p) => {
        setBgUploadPct(p.percent);
      }, controller.signal);
      toast.success("上传完成，AI 正在绘制...");
      for (let i = 0; i < 120; i++) {
        // @cuiruoni+组件卸载后停止轮询，避免对已卸载组件 setState
        if (!mountedRef.current) return;
        await sleep(3000);
        if (!mountedRef.current) return;
        const task = await styleApi.getTask(taskId);
        if (task.status === "done" && task.result_url) {
          const dataUrl = await urlToDataUrl(task.result_url);
          if (!mountedRef.current) return;
          applyBg({ type: "style", style_id: bgStyleId, source: dataUrl });
          setBgPreview(null);
          toast.success("风格化背景已生成并应用");
          return;
        }
        if (task.status === "failed") {
          toast.error(task.error || "生成失败，请重试");
          return;
        }
      }
      toast.error("生成超时，请重试");
    } catch (e) {
      if ((e as DOMException)?.name === "AbortError") {
        toast.info("上传已取消");
      } else {
        toast.error(e instanceof Error ? e.message : "上传/生成失败");
      }
    } finally {
      bgCancelRef.current = null;
      setBgGenerating(false);
    }
  };

  // 危险操作：删除账号需要二次确认，当前仅作提示占位，无实际API调用
  const handleDeleteAccount = () => {
    const confirmed = window.confirm(`确定要删除账号吗？此操作不可恢复，所有数据将被清除。`);
    if (confirmed) {
      toast.error(`账号删除功能尚未接入后端，请联系管理员`);
    }
  };

  return (
    <div data-cmp="Settings" className="min-h-screen relative">
      <GlassBackground />
      <Navbar isLoggedIn={isLoggedIn} onLogout={handleLogout} onLogin={() => navigate(`/login`)} />

      <div className="relative z-10" style={{ paddingTop: 64 }}>
        <div className="mx-auto px-6 py-10" style={{ maxWidth: 1440 }}>
          <h1 className="text-2xl font-black text-[var(--foreground)] mb-8">设置</h1>

          <div className="flex gap-8">
            {/* Left nav */}
            <div className="flex-shrink-0" style={{ width: 240 }}>
              <div className="card p-3 sticky" style={{ top: 88 }}>
                {settingsSections.map((section) => (
                  <button
                    key={section.key}
                    onClick={() => setActiveSection(section.key)}
                    className={`w-full flex items-center justify-between px-4 py-3 rounded-xl text-sm font-medium transition-all ${
                      activeSection === section.key
                        ? "bg-[var(--brand-subtle)] text-[var(--foreground)]"
                        : "text-[var(--muted-foreground)]"
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      <div
                        className="w-7 h-7 rounded-lg flex items-center justify-center bg-[var(--muted)] text-[var(--muted-foreground)]"
                      >
                        <section.icon size={14} />
                      </div>
                      {section.label}
                    </div>
                    <ChevronRight size={14} className="opacity-40" />
                  </button>
                ))}

                <div className="mt-4 pt-4 border-t border-[var(--border)]">
                  <button
                    onClick={handleLogout}
                    className="w-full flex items-center gap-3 px-4 py-3 rounded-xl text-sm transition-all hover:bg-[var(--brand-subtle)] text-[var(--muted-foreground)]"
                  >
                    <LogOut size={14} />
                    退出登录
                  </button>
                </div>
              </div>
            </div>

            {/* Right content */}
            <div className="flex-1 min-w-0">
              {/* Profile Section */}
              <div className={activeSection === `profile` ? `` : `hidden`}>
                <div className="card p-7 mb-6">
                  <h2 className="text-lg font-bold text-[var(--foreground)] mb-6">个人资料</h2>

                  {/* Avatar */}
                  <div className="flex items-center gap-5 mb-8">
                    <div className="relative">
                      {avatarUrl ? (
                        <img
                          src={avatarUrl}
                          alt="头像"
                          className="w-20 h-20 rounded-2xl object-cover"
                        />
                      ) : (
                        <div
                          className="w-20 h-20 rounded-2xl flex items-center justify-center text-xl font-black bg-[var(--foreground)] text-[var(--background)]"
                        >
                          {name ? name.slice(0, 2).toUpperCase() : `U`}
                        </div>
                      )}
                      <button
                        onClick={() => setShowAvatarInput(!showAvatarInput)}
                        className="absolute -bottom-1 -right-1 w-7 h-7 rounded-lg flex items-center justify-center transition-all hover:opacity-80 bg-[var(--foreground)] text-[var(--background)]"
                      >
                        <Camera size={13} />
                      </button>
                    </div>
                    <div>
                      <div className="text-sm font-semibold text-[var(--foreground)] mb-1">更换头像</div>
                      <div className="text-xs text-[var(--muted-foreground)]">输入头像图片链接</div>
                      {showAvatarInput && (
                        <div className="mt-2 flex gap-2">
                          <input
                            type="text"
                            placeholder="输入头像 URL..."
                            value={avatarUrl}
                            onChange={(e) => setAvatarUrl(e.target.value)}
                            className="glass-input px-3 py-1.5 rounded-lg text-xs"
                            style={{ width: 220 }}
                          />
                          <button
                            onClick={() => setShowAvatarInput(false)}
                            className="text-xs btn-ghost px-2 py-1.5 rounded-lg text-[var(--foreground)]"
                          >
                            确定
                          </button>
                        </div>
                      )}
                    </div>
                  </div>

                  <div className="flex flex-col gap-5">
                    <div>
                      <label className="text-xs font-medium mb-1.5 block text-[var(--muted-foreground)]">用户名（不可修改）</label>
                      <input
                        type="text"
                        value={name}
                        readOnly
                        className="glass-input w-full px-4 py-3 rounded-xl text-sm"
                        style={{ opacity: 0.6, cursor: `not-allowed` }}
                      />
                    </div>

                    <div>
                      <label className="text-xs font-medium mb-1.5 block text-[var(--muted-foreground)]">邮箱地址</label>
                      <input
                        type="email"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        className="glass-input w-full px-4 py-3 rounded-xl text-sm"
                        placeholder="your@email.com"
                      />
                    </div>

                    <div>
                      <label className="text-xs font-medium mb-1.5 block text-[var(--muted-foreground)]">个人简介</label>
                      <textarea
                        value={bio}
                        onChange={(e) => setBio(e.target.value)}
                        rows={3}
                        className="glass-input w-full px-4 py-3 rounded-xl text-sm resize-none"
                      />
                    </div>

                    <div className="flex gap-5">
                      <div className="flex-1">
                        <label className="text-xs font-medium mb-1.5 block text-[var(--muted-foreground)]">所在地</label>
                        <input
                          type="text"
                          value={location}
                          onChange={(e) => setLocation(e.target.value)}
                          className="glass-input w-full px-4 py-3 rounded-xl text-sm"
                        />
                      </div>
                      <div className="flex-1">
                        <label className="text-xs font-medium mb-1.5 block text-[var(--muted-foreground)]">个人网站</label>
                        <input
                          type="text"
                          value={website}
                          onChange={(e) => setWebsite(e.target.value)}
                          className="glass-input w-full px-4 py-3 rounded-xl text-sm"
                        />
                      </div>
                    </div>

                    <div>
                      <label className="text-xs font-medium mb-1.5 block text-[var(--muted-foreground)]">Twitter / X</label>
                      <input
                        type="text"
                        value={twitter}
                        onChange={(e) => setTwitter(e.target.value)}
                        className="glass-input w-full px-4 py-3 rounded-xl text-sm"
                      />
                    </div>

                    <div className="flex justify-end">
                      <button onClick={handleSaveProfile} disabled={savingProfile} className="btn-primary flex items-center gap-2 px-6 py-3 rounded-xl text-sm font-semibold" style={{ opacity: savingProfile ? 0.65 : 1 }}>
                        <Check size={14} />
                        {savingProfile ? `保存中...` : `保存修改`}
                      </button>
                    </div>
                  </div>
                </div>
              </div>

              {/* Notifications Section */}
              <div className={activeSection === `notifications` ? `` : `hidden`}>
                <div className="card p-7 mb-6">
                  <h2 className="text-lg font-bold text-[var(--foreground)] mb-6">通知偏好</h2>
                  <div className="flex flex-col gap-4">
                    {notifOptions.map((opt) => (
                      <div
                        key={opt.key}
                        className="flex items-center justify-between py-3 px-4 rounded-xl transition-colors hover:bg-[var(--brand-subtle)] border-b border-[var(--border)]"
                      >
                        <div>
                          <div className="text-sm font-medium text-[var(--foreground)]">{opt.label}</div>
                          <div className="text-xs mt-0.5 text-[var(--muted-foreground)]">{opt.desc}</div>
                        </div>
                        <button
                          onClick={() => setNotifStates((prev) => ({ ...prev, [opt.key]: !prev[opt.key] }))}
                          className={`relative rounded-full transition-all flex-shrink-0 ${
                            notifStates[opt.key] ? "bg-[var(--foreground)]" : "bg-[var(--border)]"
                          }`}
                          style={{
                            width: 44,
                            height: 24,
                          }}
                        >
                          <div
                            className="absolute top-1 rounded-full transition-all bg-white"
                            style={{
                              width: 16,
                              height: 16,
                              left: notifStates[opt.key] ? 24 : 4,
                            }}
                          />
                        </button>
                      </div>
                    ))}
                  </div>
                  <div className="flex justify-end mt-6">
                    <button onClick={handleSaveNotif} className="btn-primary flex items-center gap-2 px-6 py-3 rounded-xl text-sm font-semibold">
                      <Check size={14} />
                      保存设置
                    </button>
                  </div>
                </div>
              </div>

              {/* Privacy Section */}
              <div className={activeSection === `privacy` ? `` : `hidden`}>
                <div className="card p-7 mb-6">
                  <h2 className="text-lg font-bold text-[var(--foreground)] mb-6">隐私设置</h2>
                  <div className="flex flex-col gap-4 mb-8">
                    {[
                      { key: `profilePublic`, label: `公开个人主页`, desc: `所有人可以查看你的个人主页`, state: profilePublic, toggle: () => setProfilePublic(!profilePublic) },
                      { key: `showEmail`, label: `展示邮箱地址`, desc: `在个人主页显示你的邮箱地址`, state: showEmail, toggle: () => setShowEmail(!showEmail) },
                    ].map((item) => (
                      <div
                        key={item.key}
                        className="flex items-center justify-between py-3 px-4 rounded-xl border-b border-[var(--border)]"
                      >
                        <div>
                          <div className="text-sm font-medium text-[var(--foreground)]">{item.label}</div>
                          <div className="text-xs mt-0.5 text-[var(--muted-foreground)]">{item.desc}</div>
                        </div>
                        <button
                          onClick={item.toggle}
                          className={`relative rounded-full transition-all flex-shrink-0 ${
                            item.state ? "bg-[var(--foreground)]" : "bg-[var(--border)]"
                          }`}
                          style={{ width: 44, height: 24 }}
                        >
                          <div
                            className="absolute top-1 rounded-full transition-all bg-white"
                            style={{ width: 16, height: 16, left: item.state ? 24 : 4 }}
                          />
                        </button>
                      </div>
                    ))}
                  </div>

                  {/* Change password */}
                  <div className="pt-6 border-t border-[var(--border)]">
                    <h3 className="text-sm font-semibold text-[var(--foreground)] mb-4 flex items-center gap-2">
                      <Lock size={14} />
                      修改密码
                    </h3>
                    <form onSubmit={handleChangePass} className="flex flex-col gap-3">
                      <div>
                        <label className="text-xs font-medium mb-1.5 block text-[var(--muted-foreground)]">当前密码</label>
                        <input type="password" value={oldPass} onChange={(e) => setOldPass(e.target.value)} className="glass-input w-full px-4 py-3 rounded-xl text-sm" placeholder="..." />
                      </div>
                      <div>
                        <label className="text-xs font-medium mb-1.5 block text-[var(--muted-foreground)]">新密码</label>
                        <div className="relative">
                          <input
                            type={showPass ? `text` : `password`}
                            value={newPass}
                            onChange={(e) => setNewPass(e.target.value)}
                            className="glass-input w-full px-4 py-3 rounded-xl text-sm pr-11"
                            placeholder="至少6位"
                          />
                          <button type="button" onClick={() => setShowPass(!showPass)} className="absolute right-3 top-1/2 -translate-y-1/2 text-[var(--muted-foreground)]">
                            {showPass ? <EyeOff size={15} /> : <Eye size={15} />}
                          </button>
                        </div>
                      </div>
                      <div className="flex justify-end">
                        <button type="submit" className="btn-primary flex items-center gap-2 px-6 py-3 rounded-xl text-sm font-semibold">
                          确认修改
                        </button>
                      </div>
                    </form>
                  </div>
                </div>
              </div>

              {/* Appearance Section */}
              <div className={activeSection === `appearance` ? `` : `hidden`}>
                <div className="card p-7 mb-6">
                  <h2 className="text-lg font-bold text-[var(--foreground)] mb-6">外观设置</h2>

                  <div className="mb-6">
                    <label className="text-sm font-medium text-[var(--foreground)] mb-3 block">正文字号</label>
                    <div className="flex gap-2">
                      {[`small`, `medium`, `large`].map((size) => (
                        <button
                          key={size}
                          onClick={() => setFontSize(size)}
                          className={`px-5 py-2.5 rounded-xl text-sm transition-all border ${
                            fontSize === size
                              ? "bg-[var(--brand-subtle)] text-[var(--foreground)] border-[var(--border-strong)]"
                              : "bg-[var(--muted)] text-[var(--muted-foreground)] border-[var(--border)]"
                          }`}
                        >
                          {size === `small` ? `小` : size === `medium` ? `中` : `大`}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div className="flex justify-end">
                    <button onClick={() => toast.success(`外观设置已保存！`)} className="btn-primary flex items-center gap-2 px-6 py-3 rounded-xl text-sm font-semibold">
                      <Check size={14} />
                      应用设置
                    </button>
                  </div>
                </div>
              </div>

              {/* Background Section */}
              <div className={activeSection === `background` ? `` : `hidden`}>
                <div className="card p-7 mb-6">
                  <h2 className="text-lg font-bold text-[var(--foreground)] mb-2">背景设置</h2>
                  <p className="text-xs text-[var(--muted-foreground)] mb-6">
                    上传图片作为网站背景。图片仅保存在你的浏览器本地；登录后服务器会留存你的背景配置（不含图片数据）。
                  </p>

                  {/* 当前背景预览 */}
                  {bgSetting && (
                    <div className="mb-6">
                      <div className="text-sm font-medium text-[var(--foreground)] mb-3">当前背景</div>
                      <div className="relative h-40 rounded-xl overflow-hidden border border-[var(--border)]">
                        <img
                          src={bgSetting.image_url || bgSetting.source}
                          alt="当前背景"
                          className="w-full h-full object-cover"
                        />
                        <button
                          onClick={removeBg}
                          className="absolute top-2 right-2 flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-medium bg-black/60 text-white hover:bg-black/80 transition-colors"
                        >
                          <X size={12} /> 移除背景
                        </button>
                      </div>
                      {bgSetting.type === "style" && (
                        <div className="mt-2 text-xs text-[var(--muted-foreground)]">
                          当前为 AI 风格化背景（风格：{bgSetting.style_id || "自定义"}）
                        </div>
                      )}
                    </div>
                  )}

                  {/* 上传新背景 */}
                  <div className="mb-6">
                    <div className="text-sm font-medium text-[var(--foreground)] mb-3">上传新背景</div>
                    <input
                      type="file"
                      accept="image/*"
                      onChange={(e) => handleBgFile(e.target.files?.[0])}
                      className="block text-sm text-[var(--muted-foreground)] file:mr-3 file:px-4 file:py-2 file:rounded-xl file:border-0 file:text-sm file:font-medium file:bg-[var(--muted)] file:text-[var(--foreground)] hover:file:bg-[var(--border)]"
                    />
                    {bgPreview && (
                      <div className="mt-3 flex items-end gap-3">
                        <img
                          src={bgPreview}
                          alt="预览"
                          className="h-32 rounded-xl border border-[var(--border)] object-cover"
                        />
                        <button
                          onClick={() => applyBg({ type: "image", source: bgPreview })}
                          className="btn-primary flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-semibold"
                        >
                          <Check size={14} /> 应用为背景
                        </button>
                      </div>
                    )}
                  </div>

                  {/* AI 风格化背景 */}
                  <div className="border-t border-[var(--border)] pt-6">
                    <div className="text-sm font-medium text-[var(--foreground)] mb-1">AI 风格化背景</div>
                    <p className="text-xs text-[var(--muted-foreground)] mb-3">
                      把上传的图片按所选风格重绘后作为背景（需在 config.json 配置 dashscope_api_key）
                    </p>
                    <div className="flex flex-wrap gap-2 mb-4">
                      {styles.map((s: StyleOption) => (
                        <button
                          key={s.id}
                          onClick={() => setBgStyleId(s.id)}
                          disabled={bgGenerating}
                          className={`px-4 py-2 rounded-xl text-xs font-medium transition-all border ${
                            bgStyleId === s.id
                              ? "bg-[var(--brand-subtle)] text-[var(--foreground)] border-[var(--border-strong)]"
                              : "bg-[var(--muted)] text-[var(--muted-foreground)] border-[var(--border)]"
                          }`}
                        >
                          {s.name}
                        </button>
                      ))}
                    </div>
                    <button
                      onClick={generateBg}
                      disabled={bgGenerating || !bgPreview}
                      className="btn-primary flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-semibold disabled:opacity-50"
                    >
                      {bgGenerating ? (
                        <><Loader2 size={14} className="animate-spin" /> {bgUploadPct > 0 && bgUploadPct < 100 ? `上传中 ${bgUploadPct}%（断点续传）...` : "AI 生成中（约 1-2 分钟）..."}</>
                      ) : (
                        <><Wand2 size={14} /> 生成风格化背景</>
                      )}
                    </button>
                    {bgGenerating && bgUploadPct > 0 && bgUploadPct < 100 && (
                      <button
                        onClick={() => bgCancelRef.current?.abort()}
                        className="ml-2 px-3 py-2.5 rounded-xl text-xs border border-[var(--border)] text-[var(--muted-foreground)] hover:bg-[var(--muted)] transition-colors"
                      >
                        取消
                      </button>
                    )}
                    {bgGenerating && bgUploadPct > 0 && bgUploadPct < 100 && (
                      <div className="mt-3 h-1.5 rounded-full bg-[var(--muted)] overflow-hidden">
                        <div
                          className="h-full rounded-full bg-[var(--primary)] transition-all duration-300"
                          style={{ width: `${bgUploadPct}%` }}
                        />
                      </div>
                    )}
                  </div>

                  {/* 服务器留存信息 */}
                  {serverBg && serverBg.type !== "none" && (
                    <div className="mt-5 pt-4 border-t border-[var(--border)] text-xs text-[var(--muted-foreground)]">
                      服务器已留存配置：
                      {serverBg.type === "style"
                        ? `AI 风格化（${serverBg.style_id || "未知"}）`
                        : "自定义图片"}
                    </div>
                  )}
                </div>
              </div>

              {/* Account Section */}
              <div className={activeSection === `account` ? `` : `hidden`}>
                <div className="card p-7 mb-6">
                  <h2 className="text-lg font-bold text-[var(--foreground)] mb-6">账号管理</h2>

                  <div className="flex flex-col gap-4">
                    <div
                      className="flex items-center justify-between p-4 rounded-xl bg-[var(--muted)] border border-[var(--border)]"
                    >
                      <div className="flex items-center gap-3">
                        <Mail size={16} />
                        <div>
                          <div className="text-sm font-medium text-[var(--foreground)]">绑定邮箱</div>
                          <div className="text-xs text-[var(--muted-foreground)]">{email || "admin@example.com"}</div>
                        </div>
                      </div>
                      <button className="btn-ghost px-3 py-1.5 rounded-lg text-xs text-[var(--foreground)]">
                        修改
                      </button>
                    </div>

                    <div className="mt-6 pt-6 border-t border-[var(--border)]">
                      <h3 className="text-sm font-semibold mb-4 text-[var(--destructive)]">危险操作</h3>
                      <div className="flex flex-col gap-3">
                        <button
                          onClick={handleLogout}
                          className="flex items-center gap-3 px-5 py-3.5 rounded-xl text-sm font-medium transition-all hover:opacity-80 bg-[var(--destructive-subtle)] border border-[var(--destructive)]/20 text-[var(--destructive)]"
                        >
                          <LogOut size={16} />
                          退出登录
                        </button>
                        <button
                          onClick={handleDeleteAccount}
                          className="flex items-center gap-3 px-5 py-3.5 rounded-xl text-sm font-medium transition-all hover:opacity-80 bg-[var(--destructive-subtle)] border border-[var(--destructive)]/20 text-[var(--destructive)]"
                        >
                          <Trash2 size={16} />
                          删除账号
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Settings;
