import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import {
  User, Bell, Shield, Palette, Globe, CreditCard,
  ChevronRight, Camera, Check, LogOut, Trash2, Mail, Lock, Eye, EyeOff
} from "lucide-react";
import GlassBackground from "../components/GlassBackground";
import Navbar from "../components/Navbar";
import { toast } from "sonner";
import { profileApi, type UserProfile } from "../lib/api";

const settingsSections = [
  { key: `profile`, label: `个人资料`, icon: User, color: `#7c6aff` },
  { key: `notifications`, label: `通知偏好`, icon: Bell, color: `#38bdf8` },
  { key: `privacy`, label: `隐私与安全`, icon: Shield, color: `#34d399` },
  { key: `appearance`, label: `外观设置`, icon: Palette, color: `#f472b6` },
  { key: `account`, label: `账号管理`, icon: Globe, color: `#f59e0b` },
];

const notifOptions = [
  { key: `likes`, label: `点赞通知`, desc: `有人点赞你的文章时通知你` },
  { key: `comments`, label: `评论通知`, desc: `收到新评论时通知你` },
  { key: `follows`, label: `关注通知`, desc: `有新粉丝时通知你` },
  { key: `mentions`, label: `提及通知`, desc: `在评论中被提及时通知你` },
  { key: `newsletter`, label: `每周精选`, desc: `每周推送精选文章摘要` },
];

const themeAccents = [
  { label: `紫色`, color: `#7c6aff` },
  { label: `青蓝`, color: `#38bdf8` },
  { label: `粉红`, color: `#f472b6` },
  { label: `橙金`, color: `#f59e0b` },
  { label: `翠绿`, color: `#34d399` },
];

// @cuiruoni+设置页组件：5个设置分区（资料/通知/隐私/外观/账号），左侧导航+右侧内容布局
const Settings = () => {
  const navigate = useNavigate();
  const [activeSection, setActiveSection] = useState(`profile`);
  const [isLoggedIn] = useState(() => !!localStorage.getItem(`blog_logged_in`));

  // Profile form - loaded from API
  const [profileLoading, setProfileLoading] = useState(true);
  const [name, setName] = useState(``);
  const [bio, setBio] = useState(``);
  const [location, setLocation] = useState(``);
  const [website, setWebsite] = useState(``);
  const [twitter, setTwitter] = useState(``);
  const [email, setEmail] = useState(``);
  const [savingProfile, setSavingProfile] = useState(false);

  // @cuiruoni+从后端API加载用户资料
  useEffect(() => {
    const loadProfile = async () => {
      setProfileLoading(true);
      const profile = await profileApi.get();
      if (profile) {
        setName(profile.username);
        setBio(profile.bio);
        setLocation(profile.location);
        setWebsite(profile.website);
        setTwitter(profile.twitter);
        setEmail(profile.email);
      }
      setProfileLoading(false);
    };
    loadProfile();
  }, []);

  // Notifications
  // @cuiruoni+通知开关状态：每个通知类型独立控制，默认开启点赞/评论/关注/精选，关闭提及
  const [notifStates, setNotifStates] = useState<Record<string, boolean>>({
    likes: true, comments: true, follows: true, mentions: false, newsletter: true,
  });

  // Privacy
  const [profilePublic, setProfilePublic] = useState(true);
  const [showEmail, setShowEmail] = useState(false);

  // Password
  const [showPass, setShowPass] = useState(false);
  const [newPass, setNewPass] = useState(``);

  // Appearance
  const [selectedAccent, setSelectedAccent] = useState(`#7c6aff`);
  const [fontSize, setFontSize] = useState(`medium`);

  const handleSaveProfile = async () => {
    setSavingProfile(true);
    const result = await profileApi.update({ email, bio, location, website, twitter });
    setSavingProfile(false);
    if (result) {
      toast.success(`个人资料已保存！`);
    } else {
      toast.error(`保存失败，请稍后重试`);
    }
  };

  const handleSaveNotif = () => {
    toast.success(`通知设置已保存！`);
  };

  // @cuiruoni+密码修改校验：最少6位，通过后调用后端API
  const [oldPass, setOldPass] = useState(``);
  const [changingPass, setChangingPass] = useState(false);

  const handleChangePass = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!oldPass) { toast.error(`请输入当前密码`); return; }
    if (newPass.length < 6) { toast.error(`密码至少需要6位`); return; }
    setChangingPass(true);
    const ok = await profileApi.changePassword(oldPass, newPass);
    setChangingPass(false);
    if (ok) {
      toast.success(`密码修改成功！`);
      setOldPass(``);
      setNewPass(``);
    } else {
      toast.error(`密码修改失败，请检查当前密码是否正确`);
    }
  };

  const handleLogout = () => {
    localStorage.removeItem(`blog_logged_in`);
    navigate(`/login`);
  };

  // @cuiruoni+危险操作：删除账号需要二次确认，防止误操作
  const handleDeleteAccount = () => {
    toast.error(`账号删除功能需要二次确认`);
  };

  return (
    <div data-cmp="Settings" className="min-h-screen relative">
      <GlassBackground showParticles={false} />
      <Navbar isLoggedIn={isLoggedIn} onLogout={handleLogout} onLogin={() => navigate(`/login`)} />

      <div className="relative z-10" style={{ paddingTop: 64 }}>
        <div className="mx-auto px-6 py-10" style={{ maxWidth: 1440 }}>
          <h1 className="text-2xl font-black text-foreground mb-8">⚙️ 设置</h1>

          <div className="flex gap-8">
            {/* Left nav */}
            <div className="flex-shrink-0" style={{ width: 240 }}>
              <div className="glass-card p-3 sticky" style={{ top: 88 }}>
                {settingsSections.map((section) => (
                  <button
                    key={section.key}
                    onClick={() => setActiveSection(section.key)}
                    className="w-full flex items-center justify-between px-4 py-3 rounded-xl text-sm font-medium transition-all"
                    style={{
                      background: activeSection === section.key ? `rgba(124,106,255,0.12)` : `transparent`,
                      color: activeSection === section.key ? `#a78bfa` : `rgba(232,234,246,0.65)`,
                    }}
                  >
                    <div className="flex items-center gap-3">
                      <div
                        className="w-7 h-7 rounded-lg flex items-center justify-center"
                        style={{ background: `${section.color}18` }}
                      >
                        <section.icon size={14} style={{ color: section.color }} />
                      </div>
                      {section.label}
                    </div>
                    <ChevronRight size={14} style={{ opacity: 0.4 }} />
                  </button>
                ))}

                <div className="mt-4 pt-4" style={{ borderTop: `1px solid rgba(255,255,255,0.06)` }}>
                  <button
                    onClick={handleLogout}
                    className="w-full flex items-center gap-3 px-4 py-3 rounded-xl text-sm transition-all hover:bg-white/5"
                    style={{ color: `rgba(244,114,182,0.7)` }}
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
                <div className="glass-card p-7 mb-6">
                  <h2 className="text-lg font-bold text-foreground mb-6">个人资料</h2>

                  {/* Avatar */}
                  <div className="flex items-center gap-5 mb-8">
                    <div className="relative">
                      <div
                        className="w-20 h-20 rounded-2xl flex items-center justify-center text-xl font-black"
                        style={{
                          background: `linear-gradient(135deg, #7c6aff, #f472b6)`,
                          boxShadow: `0 4px 20px rgba(124,106,255,0.3)`,
                        }}
                      >
                        NC
                      </div>
                      <button
                        className="absolute -bottom-1 -right-1 w-7 h-7 rounded-lg flex items-center justify-center transition-all hover:opacity-80"
                        style={{ background: `linear-gradient(135deg, #7c6aff, #38bdf8)` }}
                      >
                        <Camera size={13} style={{ color: `white` }} />
                      </button>
                    </div>
                    <div>
                      <div className="text-sm font-semibold text-foreground mb-1">更换头像</div>
                      <div className="text-xs" style={{ color: `rgba(232,234,246,0.4)` }}>支持 JPG / PNG，最大 2MB</div>
                      <button className="mt-2 text-xs btn-ghost-glass px-3 py-1.5 rounded-lg text-foreground">
                        上传图片
                      </button>
                    </div>
                  </div>

                  <div className="flex flex-col gap-5">
                    <div className="flex gap-5">
                      <div className="flex-1">
                        <label className="text-xs font-medium mb-1.5 block" style={{ color: `rgba(232,234,246,0.6)` }}>显示名称</label>
                        <input
                          type="text"
                          value={name}
                          onChange={(e) => setName(e.target.value)}
                          className="glass-input w-full px-4 py-3 rounded-xl text-sm"
                        />
                      </div>
                      <div className="flex-1">
                        <label className="text-xs font-medium mb-1.5 block" style={{ color: `rgba(232,234,246,0.6)` }}>用户名</label>
                        <input
                          type="text"
                          defaultValue={`novachen`}
                          className="glass-input w-full px-4 py-3 rounded-xl text-sm"
                          readOnly
                          style={{ opacity: 0.6, cursor: `not-allowed` }}
                        />
                      </div>
                    </div>

                    <div>
                      <label className="text-xs font-medium mb-1.5 block" style={{ color: `rgba(232,234,246,0.6)` }}>邮箱地址</label>
                      <input
                        type="email"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        className="glass-input w-full px-4 py-3 rounded-xl text-sm"
                        placeholder="your@email.com"
                      />
                    </div>

                    <div>
                      <label className="text-xs font-medium mb-1.5 block" style={{ color: `rgba(232,234,246,0.6)` }}>个人简介</label>
                      <textarea
                        value={bio}
                        onChange={(e) => setBio(e.target.value)}
                        rows={3}
                        className="glass-input w-full px-4 py-3 rounded-xl text-sm resize-none"
                      />
                    </div>

                    <div className="flex gap-5">
                      <div className="flex-1">
                        <label className="text-xs font-medium mb-1.5 block" style={{ color: `rgba(232,234,246,0.6)` }}>所在地</label>
                        <input
                          type="text"
                          value={location}
                          onChange={(e) => setLocation(e.target.value)}
                          className="glass-input w-full px-4 py-3 rounded-xl text-sm"
                        />
                      </div>
                      <div className="flex-1">
                        <label className="text-xs font-medium mb-1.5 block" style={{ color: `rgba(232,234,246,0.6)` }}>个人网站</label>
                        <input
                          type="text"
                          value={website}
                          onChange={(e) => setWebsite(e.target.value)}
                          className="glass-input w-full px-4 py-3 rounded-xl text-sm"
                        />
                      </div>
                    </div>

                    <div>
                      <label className="text-xs font-medium mb-1.5 block" style={{ color: `rgba(232,234,246,0.6)` }}>Twitter / X</label>
                      <input
                        type="text"
                        value={twitter}
                        onChange={(e) => setTwitter(e.target.value)}
                        className="glass-input w-full px-4 py-3 rounded-xl text-sm"
                      />
                    </div>

                    <div className="flex justify-end">
                      <button onClick={handleSaveProfile} disabled={savingProfile} className="btn-primary-glass flex items-center gap-2 px-6 py-3 rounded-xl text-sm font-semibold" style={{ opacity: savingProfile ? 0.65 : 1 }}>
                        <Check size={14} />
                        {savingProfile ? `保存中...` : `保存修改`}
                      </button>
                    </div>
                  </div>
                </div>
              </div>

              {/* Notifications Section */}
              <div className={activeSection === `notifications` ? `` : `hidden`}>
                <div className="glass-card p-7 mb-6">
                  <h2 className="text-lg font-bold text-foreground mb-6">通知偏好</h2>
                  <div className="flex flex-col gap-4">
                    {notifOptions.map((opt) => (
                      <div
                        key={opt.key}
                        className="flex items-center justify-between py-3 px-4 rounded-xl transition-colors hover:bg-white/3"
                        style={{ borderBottom: `1px solid rgba(255,255,255,0.04)` }}
                      >
                        <div>
                          <div className="text-sm font-medium text-foreground">{opt.label}</div>
                          <div className="text-xs mt-0.5" style={{ color: `rgba(232,234,246,0.45)` }}>{opt.desc}</div>
                        </div>
                        <button
                          onClick={() => setNotifStates((prev) => ({ ...prev, [opt.key]: !prev[opt.key] }))}
                          className="relative rounded-full transition-all"
                          style={{
                            width: 44,
                            height: 24,
                            background: notifStates[opt.key] ? `linear-gradient(135deg, #7c6aff, #38bdf8)` : `rgba(255,255,255,0.1)`,
                            flexShrink: 0,
                          }}
                        >
                          <div
                            className="absolute top-1 rounded-full transition-all"
                            style={{
                              width: 16,
                              height: 16,
                              background: `white`,
                              left: notifStates[opt.key] ? 24 : 4,
                            }}
                          />
                        </button>
                      </div>
                    ))}
                  </div>
                  <div className="flex justify-end mt-6">
                    <button onClick={handleSaveNotif} className="btn-primary-glass flex items-center gap-2 px-6 py-3 rounded-xl text-sm font-semibold">
                      <Check size={14} />
                      保存设置
                    </button>
                  </div>
                </div>
              </div>

              {/* Privacy Section */}
              <div className={activeSection === `privacy` ? `` : `hidden`}>
                <div className="glass-card p-7 mb-6">
                  <h2 className="text-lg font-bold text-foreground mb-6">隐私设置</h2>
                  <div className="flex flex-col gap-4 mb-8">
                    {[
                      { key: `profilePublic`, label: `公开个人主页`, desc: `所有人可以查看你的个人主页`, state: profilePublic, toggle: () => setProfilePublic(!profilePublic) },
                      { key: `showEmail`, label: `展示邮箱地址`, desc: `在个人主页显示你的邮箱地址`, state: showEmail, toggle: () => setShowEmail(!showEmail) },
                    ].map((item) => (
                      <div
                        key={item.key}
                        className="flex items-center justify-between py-3 px-4 rounded-xl"
                        style={{ borderBottom: `1px solid rgba(255,255,255,0.04)` }}
                      >
                        <div>
                          <div className="text-sm font-medium text-foreground">{item.label}</div>
                          <div className="text-xs mt-0.5" style={{ color: `rgba(232,234,246,0.45)` }}>{item.desc}</div>
                        </div>
                        <button
                          onClick={item.toggle}
                          className="relative rounded-full transition-all flex-shrink-0"
                          style={{
                            width: 44, height: 24,
                            background: item.state ? `linear-gradient(135deg, #34d399, #38bdf8)` : `rgba(255,255,255,0.1)`,
                          }}
                        >
                          <div
                            className="absolute top-1 rounded-full transition-all"
                            style={{ width: 16, height: 16, background: `white`, left: item.state ? 24 : 4 }}
                          />
                        </button>
                      </div>
                    ))}
                  </div>

                  {/* Change password */}
                  <div style={{ borderTop: `1px solid rgba(255,255,255,0.06)` }} className="pt-6">
                    <h3 className="text-sm font-semibold text-foreground mb-4 flex items-center gap-2">
                      <Lock size={14} style={{ color: `#34d399` }} />
                      修改密码
                    </h3>
                    <form onSubmit={handleChangePass} className="flex flex-col gap-3">
                      <div>
                        <label className="text-xs font-medium mb-1.5 block" style={{ color: `rgba(232,234,246,0.6)` }}>当前密码</label>
                        <input type="password" value={oldPass} onChange={(e) => setOldPass(e.target.value)} className="glass-input w-full px-4 py-3 rounded-xl text-sm" placeholder="••••••••" />
                      </div>
                      <div>
                        <label className="text-xs font-medium mb-1.5 block" style={{ color: `rgba(232,234,246,0.6)` }}>新密码</label>
                        <div className="relative">
                          <input
                            type={showPass ? `text` : `password`}
                            value={newPass}
                            onChange={(e) => setNewPass(e.target.value)}
                            className="glass-input w-full px-4 py-3 rounded-xl text-sm pr-11"
                            placeholder="至少6位"
                          />
                          <button type="button" onClick={() => setShowPass(!showPass)} className="absolute right-3 top-1/2 -translate-y-1/2">
                            {showPass ? <EyeOff size={15} style={{ color: `rgba(232,234,246,0.4)` }} /> : <Eye size={15} style={{ color: `rgba(232,234,246,0.4)` }} />}
                          </button>
                        </div>
                      </div>
                      <div className="flex justify-end">
                        <button type="submit" className="btn-primary-glass flex items-center gap-2 px-6 py-3 rounded-xl text-sm font-semibold">
                          确认修改
                        </button>
                      </div>
                    </form>
                  </div>
                </div>
              </div>

              {/* Appearance Section */}
              <div className={activeSection === `appearance` ? `` : `hidden`}>
                <div className="glass-card p-7 mb-6">
                  <h2 className="text-lg font-bold text-foreground mb-6">外观设置</h2>

                  <div className="mb-6">
                    <label className="text-sm font-medium text-foreground mb-3 block">主题色</label>
                    <div className="flex gap-3">
                      {themeAccents.map((accent) => (
                        <button
                          key={accent.color}
                          onClick={() => setSelectedAccent(accent.color)}
                          className="flex flex-col items-center gap-2"
                        >
                          <div
                            className="w-10 h-10 rounded-xl flex items-center justify-center transition-all"
                            style={{
                              background: accent.color,
                              border: selectedAccent === accent.color ? `2px solid white` : `2px solid transparent`,
                              boxShadow: selectedAccent === accent.color ? `0 0 15px ${accent.color}60` : `none`,
                            }}
                          >
                            <div className={selectedAccent === accent.color ? `` : `hidden`}>
                              <Check size={14} style={{ color: `white` }} />
                            </div>
                          </div>
                          <span className="text-xs" style={{ color: `rgba(232,234,246,0.5)` }}>{accent.label}</span>
                        </button>
                      ))}
                    </div>
                  </div>

                  <div className="mb-6">
                    <label className="text-sm font-medium text-foreground mb-3 block">正文字号</label>
                    <div className="flex gap-2">
                      {[`small`, `medium`, `large`].map((size) => (
                        <button
                          key={size}
                          onClick={() => setFontSize(size)}
                          className="px-5 py-2.5 rounded-xl text-sm transition-all"
                          style={{
                            background: fontSize === size ? `rgba(124,106,255,0.15)` : `rgba(255,255,255,0.05)`,
                            color: fontSize === size ? `#a78bfa` : `rgba(232,234,246,0.6)`,
                            border: `1px solid ${fontSize === size ? `rgba(124,106,255,0.3)` : `rgba(255,255,255,0.07)`}`,
                          }}
                        >
                          {size === `small` ? `小` : size === `medium` ? `中` : `大`}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div className="flex justify-end">
                    <button onClick={() => toast.success(`外观设置已保存！`)} className="btn-primary-glass flex items-center gap-2 px-6 py-3 rounded-xl text-sm font-semibold">
                      <Check size={14} />
                      应用设置
                    </button>
                  </div>
                </div>
              </div>

              {/* Account Section */}
              <div className={activeSection === `account` ? `` : `hidden`}>
                <div className="glass-card p-7 mb-6">
                  <h2 className="text-lg font-bold text-foreground mb-6">账号管理</h2>

                  <div className="flex flex-col gap-4">
                    <div
                      className="flex items-center justify-between p-4 rounded-xl"
                      style={{ background: `rgba(255,255,255,0.03)`, border: `1px solid rgba(255,255,255,0.06)` }}
                    >
                      <div className="flex items-center gap-3">
                        <Mail size={16} style={{ color: `#38bdf8` }} />
                        <div>
                          <div className="text-sm font-medium text-foreground">绑定邮箱</div>
                          <div className="text-xs" style={{ color: `rgba(232,234,246,0.45)` }}>nova@example.com</div>
                        </div>
                      </div>
                      <button className="btn-ghost-glass px-3 py-1.5 rounded-lg text-xs text-foreground">
                        修改
                      </button>
                    </div>

                    <div className="mt-6 pt-6" style={{ borderTop: `1px solid rgba(255,255,255,0.06)` }}>
                      <h3 className="text-sm font-semibold mb-4" style={{ color: `rgba(244,114,182,0.8)` }}>危险操作</h3>
                      <div className="flex flex-col gap-3">
                        <button
                          onClick={handleLogout}
                          className="flex items-center gap-3 px-5 py-3.5 rounded-xl text-sm font-medium transition-all hover:opacity-80"
                          style={{
                            background: `rgba(244,114,182,0.08)`,
                            border: `1px solid rgba(244,114,182,0.18)`,
                            color: `#f472b6`,
                          }}
                        >
                          <LogOut size={16} />
                          退出登录
                        </button>
                        <button
                          onClick={handleDeleteAccount}
                          className="flex items-center gap-3 px-5 py-3.5 rounded-xl text-sm font-medium transition-all hover:opacity-80"
                          style={{
                            background: `rgba(239,68,68,0.08)`,
                            border: `1px solid rgba(239,68,68,0.18)`,
                            color: `#ef4444`,
                          }}
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
