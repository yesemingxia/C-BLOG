/* SceneContact.tsx — 场景 4：联系页与反馈表单
 *
 * 迁移自 `person/index.html:149-202` + `script.js:499-534`。
 *
 * ⚠️ 两个照抄过来的细节：
 *
 * 1. **reveal 入场动效靠内联 `--reveal-delay`**（0 / 120 / 200 / 280 / 560ms），
 *    由 `.ssp-scope[data-phase="scene4"] .contact-reveal` 那条规则驱动。
 *    删掉内联变量 → 五块内容会同时出现，没有依次淡入。
 *
 * 2. **表单提交**：默认提交到自家后端 `POST /api/contact`（contact_controller 落库，
 *    公开接口无需登录）；`CONFIG.formspreeEndpoint` 配了 Formspree 时才走第三方。
 *
 * 另：toast 成功态**刻意不设颜色**。原版写的是 `toast.style.color = ok ? 'var(--accent)' : '#FF8A8A'`，
 * 而 person 的 `:root` 里**根本没有定义 `--accent`** —— 所以那条赋值实际无效，成功时是继承父级颜色。
 * 迁到 C-BLOG 后 scope 内能解析到 C-BLOG 的 `--accent`，行为会**变**（多出一个浅灰）。
 * 这里用"不设色"忠实还原 person 的实际表现。
 */

import { useRef, useState, type CSSProperties, type FormEvent } from "react";
import { CONFIG } from "../config";
import { contactApi } from "../../lib/api";

/** 三张联系信息卡的展示文案与取值（原版写在 index.html 里，id 由 applyPersona 填） */
const useContactCards = () => {
  const p = CONFIG.persona;
  return [
    {
      key: "email",
      label: "Email",
      value: p.email,
      note: "Project / Collaboration",
      className: "contact-info-card contact-info-card-email glass-panel contact-reveal",
      delay: "120ms",
    },
    {
      key: "github",
      label: "GitHub",
      value: p.github,
      note: "Code / Portfolio",
      className: "contact-info-card glass-panel contact-reveal",
      delay: "200ms",
    },
    {
      key: "douyin",
      label: "Douyin",
      value: p.douyin,
      note: "抖音 / Douyin",
      className: "contact-info-card glass-panel contact-reveal",
      delay: "280ms",
    },
  ];
};

const SceneContact = () => {
  const cards = useContactCards();
  const formRef = useRef<HTMLFormElement | null>(null);

  const [submitting, setSubmitting] = useState(false);
  const [toast, setToast] = useState<{ text: string; ok: boolean } | null>(null);

  const handleSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    e.stopPropagation();
    if (submitting) return;

    setSubmitting(true);
    setToast(null);

    const finish = (ok: boolean, msg: string) => {
      setSubmitting(false);
      setToast({ text: msg, ok });
      if (ok) formRef.current?.reset();
    };

    const fd = new FormData(e.currentTarget);
    const name = String(fd.get("name") ?? "");
    const email = String(fd.get("email") ?? "");
    const message = String(fd.get("message") ?? "");

    // @cuiruoni+配置了 Formspree → 走第三方；否则提交到自家后端 /api/contact（公开接口，落库）
    if (CONFIG.formspreeEndpoint) {
      try {
        const res = await fetch(CONFIG.formspreeEndpoint, {
          method: "POST",
          body: fd,
          headers: { Accept: "application/json" },
        });
        finish(res.ok, res.ok ? "感谢你的反馈 · Thanks for your feedback" : "提交失败，请稍后重试");
      } catch {
        finish(false, "提交失败，请稍后重试");
      }
      return;
    }

    try {
      await contactApi.send(name, email, message);
      finish(true, "感谢你的反馈 · Thanks for your feedback");
    } catch {
      finish(false, "提交失败，请稍后重试");
    }
  };

  return (
    <section className="page page-contact" aria-labelledby="contact-title">
      {/* 场景 4 没有视频背景，用 CSS 渐变层 */}
      <div className="contact-scene-bg" aria-hidden="true" />

      <div className="contact-layout">
        <section className="contact-intro contact-reveal" style={{ "--reveal-delay": "0ms" } as CSSProperties}>
          <p className="eyebrow">Scene 04 / Contact</p>
          <h1 id="contact-title">
            <span className="contact-title-line">Contact</span>
            <span className="contact-title-line">/联系我</span>
          </h1>
          <p className="contact-lead">有任何想法、合作或反馈，留个言就好。</p>

          <div className="contact-card-grid">
            {cards.map((c) => (
              <article
                key={c.key}
                className={c.className}
                style={{ "--reveal-delay": c.delay } as CSSProperties}
              >
                <span className="small-label">{c.label}</span>
                <strong id={`contact${c.key.charAt(0).toUpperCase()}${c.key.slice(1)}`}>{c.value}</strong>
                <p>{c.note}</p>
              </article>
            ))}
          </div>
        </section>

        <section className="contact-side">
          <form
            ref={formRef}
            id="feedbackForm"
            className="feedback-panel glass-panel contact-reveal"
            style={{ "--reveal-delay": "560ms" } as CSSProperties}
            onSubmit={handleSubmit}
          >
            <div className="panel-heading">
              <span className="small-label">Feedback</span>
              <h2>用户反馈</h2>
            </div>

            <label>
              <span>Name / 姓名</span>
              <input type="text" name="name" autoComplete="name" required />
            </label>
            <label>
              <span>Email / 邮箱</span>
              <input type="email" name="email" autoComplete="email" required />
            </label>
            <label>
              <span>Message / 留言内容</span>
              <textarea name="message" rows={4} required />
            </label>

            <button type="submit" className="feedback-submit" id="feedbackSubmit" disabled={submitting}>
              {submitting ? "发送中…" : "Submit / 提交"}
            </button>

            {/* 成功时不设色（见文件头说明），失败时用原版的 #FF8A8A */}
            <p
              id="feedbackToast"
              className="feedback-toast"
              role="status"
              aria-live="polite"
              style={toast && !toast.ok ? { color: "#FF8A8A" } : undefined}
            >
              {toast?.text ?? ""}
            </p>
          </form>
        </section>
      </div>
    </section>
  );
};

export default SceneContact;
