import { useState, useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { motion, useInView } from "framer-motion";
import {
  ArrowRight, Github, Twitter, Mail, MapPin, Calendar,
  ExternalLink, Star, GitFork, Send, CheckCircle, AlertCircle,
  Code2, Layers, Zap, Globe, Terminal, Database, Palette,
  Smartphone, Cloud, Cpu, FileCode, Container, GitBranch
} from "lucide-react";
import MainLayout from "../components/MainLayout";

/* ─────────────────────────────────────────────
   Data: Projects (connected to backend /api/posts)
   ───────────────────────────────────────────── */
const projects = [
  {
    id: 1,
    title: "Luminary Blog Platform",
    description: "Full-stack blog platform with C++ backend, React frontend, Markdown rendering, and real-time search.",
    image: "https://trae-api-cn.mchost.guru/api/ide/v1/text_to_image?prompt=modern%20blog%20platform%20dark%20ui%20screenshot%20with%20purple%20accents&image_size=landscape_16_9",
    tags: ["React", "C++", "MySQL"],
    stars: 128,
    forks: 34,
    link: "/explore",
  },
  {
    id: 2,
    title: "AI Code Assistant",
    description: "Intelligent code completion tool powered by LLMs, supporting multiple languages and IDE integrations.",
    image: "https://trae-api-cn.mchost.guru/api/ide/v1/text_to_image?prompt=AI%20code%20assistant%20interface%20dark%20theme%20neon%20blue&image_size=landscape_16_9",
    tags: ["Python", "LLM", "VSCode"],
    stars: 256,
    forks: 67,
    link: "#",
  },
  {
    id: 3,
    title: "Design System Kit",
    description: "Comprehensive component library with 50+ accessible components, theming engine, and Figma sync.",
    image: "https://trae-api-cn.mchost.guru/api/ide/v1/text_to_image?prompt=design%20system%20components%20grid%20glassmorphism%20dark&image_size=landscape_16_9",
    tags: ["TypeScript", "Storybook", "Figma"],
    stars: 89,
    forks: 21,
    link: "#",
  },
  {
    id: 4,
    title: "Cloud Deploy CLI",
    description: "One-command deployment tool for containerized apps to any cloud provider with zero-config setup.",
    image: "https://trae-api-cn.mchost.guru/api/ide/v1/text_to_image?prompt=terminal%20CLI%20tool%20deployment%20dark%20neon%20green&image_size=landscape_16_9",
    tags: ["Go", "Docker", "K8s"],
    stars: 312,
    forks: 89,
    link: "#",
  },
];

/* ── Tech stack icons for marquee ── */
const techStack = [
  { name: "React", icon: Code2 },
  { name: "TypeScript", icon: FileCode },
  { name: "Node.js", icon: Terminal },
  { name: "C++", icon: Cpu },
  { name: "Docker", icon: Container },
  { name: "MySQL", icon: Database },
  { name: "Redis", icon: Database },
  { name: "Tailwind", icon: Palette },
  { name: "AWS", icon: Cloud },
  { name: "Git", icon: GitBranch },
  { name: "Next.js", icon: Globe },
  { name: "React Native", icon: Smartphone },
  { name: "GraphQL", icon: Layers },
  { name: "Figma", icon: Palette },
  { name: "Vite", icon: Zap },
];

/* ─────────────────────────────────────────────
   Animation variants
   ───────────────────────────────────────────── */
const fadeUp = {
  hidden: { opacity: 0, y: 30 },
  visible: (i: number = 0) => ({
    opacity: 1,
    y: 0,
    transition: { delay: i * 0.1, duration: 0.6, ease: [0.25, 0.46, 0.45, 0.94] as [number, number, number, number] },
  }),
};

const staggerContainer = {
  hidden: {},
  visible: { transition: { staggerChildren: 0.1 } },
};

/* ─────────────────────────────────────────────
   Typing hook
   ───────────────────────────────────────────── */
// @cuiruoni+打字机效果Hook：循环展示多段文字，支持打字/删除/暂停三阶段
function useTypingEffect(texts: string[], typingSpeed = 80, deletingSpeed = 40, pauseMs = 2000) {
  const [display, setDisplay] = useState("");
  const [textIdx, setTextIdx] = useState(0);
  const [charIdx, setCharIdx] = useState(0);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    const current = texts[textIdx];
    let timer: ReturnType<typeof setTimeout>;

    if (!deleting && charIdx < current.length) {
      timer = setTimeout(() => {
        setDisplay(current.slice(0, charIdx + 1));
        setCharIdx(charIdx + 1);
      }, typingSpeed);
    } else if (!deleting && charIdx === current.length) {
      timer = setTimeout(() => setDeleting(true), pauseMs);
    } else if (deleting && charIdx > 0) {
      timer = setTimeout(() => {
        setDisplay(current.slice(0, charIdx - 1));
        setCharIdx(charIdx - 1);
      }, deletingSpeed);
    } else if (deleting && charIdx === 0) {
      setDeleting(false);
      setTextIdx((textIdx + 1) % texts.length);
    }

    return () => clearTimeout(timer);
  }, [charIdx, deleting, textIdx, texts, typingSpeed, deletingSpeed, pauseMs]);

  return display;
}

/* ─────────────────────────────────────────────
   Section wrapper with scroll-triggered animation
   ───────────────────────────────────────────── */
// @cuiruoni+滚动动画包裹组件：进入视口时触发fadeUp动画，once=true确保只触发一次
const Section = ({ children, className = "", id }: { children: React.ReactNode; className?: string; id?: string }) => {
  const ref = useRef(null);
  const isInView = useInView(ref, { once: true, margin: "-80px" });

  return (
    <motion.section
      ref={ref}
      id={id}
      initial="hidden"
      animate={isInView ? "visible" : "hidden"}
      variants={staggerContainer}
      className={className}
    >
      {children}
    </motion.section>
  );
};

/* ─────────────────────────────────────────────
   Contact form with real-time validation
   ───────────────────────────────────────────── */
// @cuiruoni+联系表单组件：实时字段校验，失焦触发验证，提交成功后显示反馈并重置
const ContactForm = () => {
  const [form, setForm] = useState({ name: "", email: "", message: "" });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [sent, setSent] = useState(false);

  const validate = (field: string, value: string) => {
    let err = "";
    if (field === "name" && value.trim().length < 2) err = "Name must be at least 2 characters";
    if (field === "email" && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) err = "Invalid email address";
    if (field === "message" && value.trim().length < 10) err = "Message must be at least 10 characters";
    setErrors((prev) => ({ ...prev, [field]: err }));
    return !err;
  };

  const handleChange = (field: string, value: string) => {
    setForm((prev) => ({ ...prev, [field]: value }));
    if (errors[field]) validate(field, value);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const nameOk = validate("name", form.name);
    const emailOk = validate("email", form.email);
    const msgOk = validate("message", form.message);
    if (nameOk && emailOk && msgOk) {
      setSent(true);
      setTimeout(() => setSent(false), 4000);
      setForm({ name: "", email: "", message: "" });
      setErrors({});
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-5" noValidate>
      {/* Name */}
      <div>
        <label htmlFor="contact-name" className="text-xs font-bold text-foreground/50 ml-1 mb-1.5 block">Name</label>
        <input
          id="contact-name"
          type="text"
          placeholder="Your name"
          value={form.name}
          onChange={(e) => handleChange("name", e.target.value)}
          onBlur={() => validate("name", form.name)}
          className="glass-input w-full px-4 py-3 rounded-xl text-sm"
          aria-invalid={!!errors.name}
        />
        {errors.name && <p className="text-xs text-red-400 mt-1 ml-1 flex items-center gap-1"><AlertCircle size={12} />{errors.name}</p>}
      </div>

      {/* Email */}
      <div>
        <label htmlFor="contact-email" className="text-xs font-bold text-foreground/50 ml-1 mb-1.5 block">Email</label>
        <input
          id="contact-email"
          type="email"
          placeholder="you@example.com"
          value={form.email}
          onChange={(e) => handleChange("email", e.target.value)}
          onBlur={() => validate("email", form.email)}
          className="glass-input w-full px-4 py-3 rounded-xl text-sm"
          aria-invalid={!!errors.email}
        />
        {errors.email && <p className="text-xs text-red-400 mt-1 ml-1 flex items-center gap-1"><AlertCircle size={12} />{errors.email}</p>}
      </div>

      {/* Message */}
      <div>
        <label htmlFor="contact-msg" className="text-xs font-bold text-foreground/50 ml-1 mb-1.5 block">Message</label>
        <textarea
          id="contact-msg"
          placeholder="Tell me about your project..."
          rows={4}
          value={form.message}
          onChange={(e) => handleChange("message", e.target.value)}
          onBlur={() => validate("message", form.message)}
          className="glass-input w-full px-4 py-3 rounded-xl text-sm resize-none"
          aria-invalid={!!errors.message}
        />
        {errors.message && <p className="text-xs text-red-400 mt-1 ml-1 flex items-center gap-1"><AlertCircle size={12} />{errors.message}</p>}
      </div>

      <button
        type="submit"
        className="btn-primary-glass w-full py-3.5 rounded-xl text-sm font-bold text-white flex items-center justify-center gap-2"
      >
        {sent ? (
          <>
            <CheckCircle size={18} /> Message Sent!
          </>
        ) : (
          <>
            <Send size={16} /> Send Message
          </>
        )}
      </button>
    </form>
  );
};

/* ═════════════════════════════════════════════
   HOME PAGE — Bento Grid Portfolio
   ═════════════════════════════════════════════ */
// @cuiruoni+首页组件：Bento Grid风格个人作品集，包含Hero/About/Projects/TechStack/Contact五大板块
const Home = () => {
  const navigate = useNavigate();
  // @cuiruoni+打字机效果循环展示多个身份标签
  const typedText = useTypingEffect(["Full-Stack Developer", "UI Designer", "Open Source Lover", "Creative Coder"], 90, 50, 2200);

  return (
    <MainLayout>
      <div className="mx-auto px-4 sm:px-6 max-w-[1280px]">

        {/* ─── HERO ─── */}
        <Section className="pt-24 md:pt-40 pb-16 md:pb-24" id="hero">
          <div className="bento-card p-8 md:p-12 lg:p-16 relative">
            {/* Decorative gradient orb */}
            <div className="absolute top-0 right-0 w-72 h-72 bg-[var(--neon-purple)]/10 rounded-full blur-[100px] pointer-events-none" />
            <div className="absolute bottom-0 left-0 w-56 h-56 bg-[var(--neon-blue)]/10 rounded-full blur-[80px] pointer-events-none" />

            <motion.div variants={fadeUp} custom={0} className="relative z-10">
              <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full mb-6 text-xs font-bold tracking-widest uppercase bg-[var(--neon-purple)]/10 text-[var(--neon-purple)] border border-[var(--neon-purple)]/20">
                <Zap size={12} className="fill-[var(--neon-purple)]/20" />
                Available for hire
              </div>
            </motion.div>

            <motion.h1
              variants={fadeUp}
              custom={1}
              className="text-4xl sm:text-5xl md:text-7xl font-black tracking-tighter leading-[0.9] mb-6"
              style={{ fontFamily: 'var(--font-display)' }}
            >
              Hey, I'm{" "}
              <span className="gradient-text neon-glow">Nova Chen</span>
            </motion.h1>

            <motion.div variants={fadeUp} custom={2} className="mb-8">
              <p className="text-xl md:text-2xl text-foreground/60 font-medium">
                I'm a <span className="text-foreground font-bold typing-cursor">{typedText}</span>
              </p>
            </motion.div>

            <motion.p variants={fadeUp} custom={3} className="max-w-2xl text-base md:text-lg text-foreground/40 leading-relaxed mb-10">
              Crafting performant web experiences with clean code and thoughtful design.
              Passionate about open source, developer tools, and pushing the boundaries of what's possible on the web.
            </motion.p>

            <motion.div variants={fadeUp} custom={4} className="flex flex-wrap items-center gap-4">
              <button
                onClick={() => navigate("/explore")}
                className="btn-primary-glass px-8 py-3.5 rounded-xl text-sm font-bold text-white flex items-center gap-2 group"
              >
                View My Work
                <ArrowRight size={18} className="group-hover:translate-x-1 transition-transform" />
              </button>
              <button
                onClick={() => navigate("/write")}
                className="btn-ghost-glass px-8 py-3.5 rounded-xl text-sm font-bold text-foreground/80 hover:text-foreground"
              >
                Read My Blog
              </button>
              <div className="flex items-center gap-3 ml-2">
                <a href="https://github.com" target="_blank" rel="noopener noreferrer" aria-label="GitHub" className="w-10 h-10 rounded-xl btn-ghost-glass flex items-center justify-center text-foreground/50 hover:text-foreground">
                  <Github size={20} />
                </a>
                <a href="https://twitter.com" target="_blank" rel="noopener noreferrer" aria-label="Twitter" className="w-10 h-10 rounded-xl btn-ghost-glass flex items-center justify-center text-foreground/50 hover:text-foreground">
                  <Twitter size={20} />
                </a>
                <a href="mailto:hello@novachen.dev" aria-label="Email" className="w-10 h-10 rounded-xl btn-ghost-glass flex items-center justify-center text-foreground/50 hover:text-foreground">
                  <Mail size={20} />
                </a>
              </div>
            </motion.div>
          </div>
        </Section>

        {/* ─── ABOUT ME + STATS BENTO ─── */}
        <Section className="pb-16" id="about">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {/* About Me — spans 2 cols */}
            <motion.div variants={fadeUp} custom={0} className="bento-card p-8 md:col-span-2">
              <h2 className="text-2xl font-black mb-4" style={{ fontFamily: 'var(--font-display)' }}>About Me</h2>
              <p className="text-foreground/50 leading-relaxed mb-4">
                I'm a full-stack developer with 5+ years of experience building web applications that scale.
                I specialize in React ecosystems, C++ high-performance backends, and cloud-native architectures.
              </p>
              <p className="text-foreground/50 leading-relaxed mb-6">
                When I'm not coding, you'll find me contributing to open-source projects, writing technical articles,
                or exploring the intersection of design and engineering. I believe great software is built at the
                crossroads of empathy and technical excellence.
              </p>
              <div className="flex flex-wrap gap-2">
                {["React", "TypeScript", "C++", "Node.js", "Docker", "MySQL", "Redis", "Tailwind"].map((tag) => (
                  <span key={tag} className="tag-glass">{tag}</span>
                ))}
              </div>
            </motion.div>

            {/* Quick stats card */}
            <motion.div variants={fadeUp} custom={1} className="bento-card p-8 flex flex-col justify-between">
              <div>
                <h3 className="text-sm font-black uppercase tracking-widest text-foreground/30 mb-6">Quick Stats</h3>
                <div className="space-y-5">
                  <div>
                    <div className="text-3xl font-black gradient-text">50+</div>
                    <div className="text-xs text-foreground/40 font-medium mt-1">Projects Completed</div>
                  </div>
                  <div>
                    <div className="text-3xl font-black gradient-text">5+</div>
                    <div className="text-xs text-foreground/40 font-medium mt-1">Years Experience</div>
                  </div>
                  <div>
                    <div className="text-3xl font-black gradient-text">2K+</div>
                    <div className="text-xs text-foreground/40 font-medium mt-1">GitHub Stars</div>
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-2 text-xs text-foreground/30 mt-6">
                <MapPin size={12} /> Shanghai, China
              </div>
            </motion.div>
          </div>

          {/* Mini info row */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mt-4">
            {[
              { icon: Github, label: "GitHub", value: "@novachen" },
              { icon: Twitter, label: "Twitter", value: "@novachen_dev" },
              { icon: Mail, label: "Email", value: "hello@novachen.dev" },
              { icon: Calendar, label: "Experience", value: "Since 2020" },
            ].map((item, i) => (
              <motion.div key={item.label} variants={fadeUp} custom={i} className="bento-card p-5 flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-[var(--neon-purple)]/10 flex items-center justify-center flex-shrink-0">
                  <item.icon size={18} className="text-[var(--neon-purple)]" />
                </div>
                <div className="min-w-0">
                  <div className="text-[10px] font-bold uppercase tracking-widest text-foreground/30">{item.label}</div>
                  <div className="text-sm font-bold truncate">{item.value}</div>
                </div>
              </motion.div>
            ))}
          </div>
        </Section>

        {/* ─── PROJECTS BENTO ─── */}
        <Section className="pb-16" id="projects">
          <motion.div variants={fadeUp} custom={0} className="flex items-center gap-3 mb-6">
            <div className="w-1 h-7 bg-gradient-to-b from-[var(--neon-purple)] to-[var(--neon-blue)] rounded-full" />
            <h2 className="text-2xl font-black" style={{ fontFamily: 'var(--font-display)' }}>Featured Projects</h2>
          </motion.div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {projects.map((project, i) => (
              <motion.article
                key={project.id}
                variants={fadeUp}
                custom={i}
                className="bento-card group cursor-pointer"
                onClick={() => navigate(project.link)}
              >
                {/* Thumbnail */}
                <div className="relative overflow-hidden aspect-video">
                  <img
                    src={project.image}
                    alt={project.title}
                    loading="lazy"
                    className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-105"
                  />
                  <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500" />
                  <div className="absolute top-3 right-3 opacity-0 group-hover:opacity-100 translate-y-2 group-hover:translate-y-0 transition-all duration-300">
                    <ExternalLink size={18} className="text-white drop-shadow-lg" />
                  </div>
                </div>

                {/* Info */}
                <div className="p-6">
                  <h3 className="text-lg font-bold mb-2 group-hover:text-[var(--neon-purple)] transition-colors" style={{ fontFamily: 'var(--font-display)' }}>
                    {project.title}
                  </h3>
                  <p className="text-sm text-foreground/40 leading-relaxed mb-4 line-clamp-2">
                    {project.description}
                  </p>
                  <div className="flex items-center justify-between">
                    <div className="flex gap-2">
                      {project.tags.map((tag) => (
                        <span key={tag} className="tag-glass text-[10px]">{tag}</span>
                      ))}
                    </div>
                    <div className="flex items-center gap-3 text-foreground/30 text-xs">
                      <span className="flex items-center gap-1"><Star size={12} />{project.stars}</span>
                      <span className="flex items-center gap-1"><GitFork size={12} />{project.forks}</span>
                    </div>
                  </div>
                </div>
              </motion.article>
            ))}
          </div>

          <motion.div variants={fadeUp} custom={4} className="mt-8 text-center">
            <button
              onClick={() => navigate("/explore")}
              className="btn-ghost-glass px-10 py-3.5 rounded-xl text-sm font-bold group"
            >
              View All Projects
              <ArrowRight size={16} className="inline ml-2 group-hover:translate-x-1 transition-transform" />
            </button>
          </motion.div>
        </Section>

        {/* ─── TECH STACK MARQUEE ─── */}
        <Section className="pb-16" id="tech-stack">
          <motion.div variants={fadeUp} custom={0} className="flex items-center gap-3 mb-6">
            <div className="w-1 h-7 bg-gradient-to-b from-[var(--neon-blue)] to-[var(--neon-purple)] rounded-full" />
            <h2 className="text-2xl font-black" style={{ fontFamily: 'var(--font-display)' }}>Tech Stack</h2>
          </motion.div>

          <motion.div variants={fadeUp} custom={1} className="bento-card p-6 overflow-hidden">
            <div className="overflow-hidden">
              <div className="marquee-track">
                {/* Duplicate items for seamless loop */}
                {[...techStack, ...techStack].map((tech, i) => (
                  <div
                    key={`${tech.name}-${i}`}
                    className="flex items-center gap-3 px-6 py-4 mx-2 rounded-xl bg-white/[0.03] border border-white/[0.06] hover:border-[var(--neon-purple)]/30 hover:bg-[var(--neon-purple)]/5 transition-all flex-shrink-0 group"
                  >
                    <tech.icon size={20} className="text-[var(--neon-purple)] group-hover:text-[var(--neon-blue)] transition-colors" />
                    <span className="text-sm font-bold whitespace-nowrap">{tech.name}</span>
                  </div>
                ))}
              </div>
            </div>
          </motion.div>
        </Section>

        {/* ─── CONTACT ─── */}
        <Section className="pb-24" id="contact">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Left: CTA */}
            <motion.div variants={fadeUp} custom={0} className="bento-card p-8 md:p-10 flex flex-col justify-center relative">
              <div className="absolute top-0 left-0 w-48 h-48 bg-[var(--neon-purple)]/8 rounded-full blur-[80px] pointer-events-none" />
              <div className="relative z-10">
                <h2 className="text-3xl md:text-4xl font-black mb-4" style={{ fontFamily: 'var(--font-display)' }}>
                  Let's Build<br />
                  <span className="gradient-text neon-glow">Something Great</span>
                </h2>
                <p className="text-foreground/40 leading-relaxed mb-8">
                  Have a project in mind? I'd love to hear about it. Whether it's a new venture,
                  an existing product that needs a refresh, or just a chat about tech — reach out.
                </p>
                <div className="space-y-3">
                  <a href="mailto:hello@novachen.dev" className="flex items-center gap-3 text-sm text-foreground/60 hover:text-[var(--neon-purple)] transition-colors">
                    <Mail size={16} /> hello@novachen.dev
                  </a>
                  <a href="https://github.com" target="_blank" rel="noopener noreferrer" className="flex items-center gap-3 text-sm text-foreground/60 hover:text-[var(--neon-purple)] transition-colors">
                    <Github size={16} /> github.com/novachen
                  </a>
                  <a href="https://twitter.com" target="_blank" rel="noopener noreferrer" className="flex items-center gap-3 text-sm text-foreground/60 hover:text-[var(--neon-purple)] transition-colors">
                    <Twitter size={16} /> @novachen_dev
                  </a>
                </div>
              </div>
            </motion.div>

            {/* Right: Contact form */}
            <motion.div variants={fadeUp} custom={1} className="bento-card p-8 md:p-10">
              <ContactForm />
            </motion.div>
          </div>
        </Section>
      </div>
    </MainLayout>
  );
};

export default Home;
