import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import { ArrowRight, PenSquare, BookOpen } from "lucide-react";
import MainLayout from "../components/layout/MainLayout";
import BlogCard, { type BlogPost } from "../components/blog/BlogCard";
import ScrollReveal from "../components/effects/ScrollReveal";
import { postsApi, type ApiPost } from "../lib/api";

const fadeUp = {
  hidden: { opacity: 0, y: 30 },
  visible: (i: number = 0) => ({
    opacity: 1,
    y: 0,
    transition: { delay: i * 0.1, duration: 0.6, ease: [0.25, 0.46, 0.45, 0.94] as [number, number, number, number] },
  }),
};

function toBlogPost(p: ApiPost): BlogPost {
  return {
    id: p.id,
    title: p.title,
    excerpt: p.excerpt ?? p.summary ?? "",
    cover: p.cover ?? `https://picsum.photos/seed/blog${p.id}/600/400`,
    author: p.author ?? "Unknown",
    authorAvatar: (p.author ?? "U").split(" ").map((w) => w[0]).join("").slice(0, 2).toUpperCase(),
    date: p.created_at?.slice(0, 10) ?? "",
    readTime: Math.max(5, Math.round((p.content?.length ?? 500) / 200)),
    likes: p.likes ?? 0,
    comments: p.comments_count ?? 0,
    views: p.views ?? 0,
    tags: p.tags ?? [],
  };
}

const Home = () => {
  const navigate = useNavigate();
  const [posts, setPosts] = useState<BlogPost[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    postsApi.list(1, 6)
      .then((data) => setPosts(data.map(toBlogPost)))
      .catch(() => setPosts([]))
      .finally(() => setLoading(false));
  }, []);

  return (
    <MainLayout>
      <div className="mx-auto px-4 sm:px-6 max-w-[1280px]">
        {/* Hero */}
        <section className="pt-24 md:pt-36 pb-16 md:pb-24 text-center">
          <motion.div
            initial="hidden"
            animate="visible"
            variants={fadeUp}
            custom={0}
            className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full mb-6 text-xs font-bold tracking-widest uppercase bg-[var(--brand-subtle)] text-[var(--primary)] border border-[var(--brand-border)]"
          >
            <BookOpen size={12} />
            Discover stories & ideas
          </motion.div>

          <motion.h1
            variants={fadeUp}
            custom={1}
            initial="hidden"
            animate="visible"
            className="text-4xl sm:text-5xl md:text-6xl font-black tracking-tight leading-[1.1] mb-6 text-[var(--foreground)]"
            style={{ fontFamily: 'var(--font-display)' }}
          >
            Welcome to{" "}
            <span className="text-[var(--primary)]">Blog</span>
          </motion.h1>

          <motion.p
            variants={fadeUp}
            custom={2}
            initial="hidden"
            animate="visible"
            className="max-w-2xl mx-auto text-base md:text-lg text-[var(--muted-foreground)] leading-relaxed mb-10"
          >
            A clean, simple space to read, write, and share ideas. Explore featured articles or start writing your own.
          </motion.p>

          <motion.div
            variants={fadeUp}
            custom={3}
            initial="hidden"
            animate="visible"
            className="flex flex-wrap items-center justify-center gap-4"
          >
            <button
              onClick={() => navigate("/explore")}
              className="btn-primary px-8 py-3.5 rounded-xl text-sm font-bold text-[var(--primary-foreground)] flex items-center gap-2 group"
            >
              Explore Articles
              <ArrowRight size={18} className="group-hover:translate-x-1 transition-transform" />
            </button>
            <button
              onClick={() => navigate("/write")}
              className="btn-ghost px-8 py-3.5 rounded-xl text-sm font-bold text-[var(--muted-foreground)] hover:text-[var(--foreground)] flex items-center gap-2"
            >
              <PenSquare size={16} />
              Write
            </button>
          </motion.div>
        </section>

        {/* Recent posts */}
        <section className="pb-24">
          <ScrollReveal>
            <div className="flex items-center justify-between mb-8">
              <h2 className="text-2xl font-black text-[var(--foreground)]" style={{ fontFamily: 'var(--font-display)' }}>
                Recent Posts
              </h2>
              <button
                onClick={() => navigate("/explore")}
                className="text-sm font-semibold text-[var(--primary)] hover:underline flex items-center gap-1"
              >
                View all <ArrowRight size={14} />
              </button>
            </div>
          </ScrollReveal>

          {loading ? (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
              {Array.from({ length: 6 }).map((_, i) => (
                <div key={i} className="card h-80 animate-pulse bg-[var(--muted)]" />
              ))}
            </div>
          ) : posts.length > 0 ? (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
              {posts.map((post, index) => (
                <ScrollReveal key={post.id} delay={index * 100}>
                  <BlogCard post={post} />
                </ScrollReveal>
              ))}
            </div>
          ) : (
            <ScrollReveal>
              <div className="text-center py-20 card rounded-2xl">
                <div className="text-4xl mb-4">📝</div>
                <div className="text-[var(--foreground)] font-medium mb-2">No posts yet</div>
                <div className="text-sm text-[var(--muted-foreground)] mb-6">Be the first to share your story.</div>
                <button
                  onClick={() => navigate("/write")}
                  className="btn-primary px-6 py-2.5 rounded-xl text-sm font-semibold text-[var(--primary-foreground)]"
                >
                  Start Writing
                </button>
              </div>
            </ScrollReveal>
          )}
        </section>
      </div>
    </MainLayout>
  );
};

export default Home;
