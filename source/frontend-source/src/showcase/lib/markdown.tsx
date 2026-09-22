/* markdown.tsx — showcase 内共用的极简 Markdown 渲染
 *
 * 从 `components/SceneEditor.tsx` 抽出来：场景 2 的阅读弹窗要渲染**文章正文**，
 * 与编辑器的预览是同一套需求，复制一份就会变成两处维护。
 *
 * 覆盖范围（刻意做小，不引第三方库）：
 *   · 围栏代码块 ``` … ```
 *   · 标题 # / ## / ###
 *   · 引用 > （单独成行）
 *   · 列表 - * / 1.（连续同类行合并成一个 ul|ol）
 *   · 行内：**粗体** · `代码` · [链接](url)
 *   · 空行 → 间距，其余 → 段落
 *
 * 比 `pages/Write.tsx` 的 renderPreview 强两项（围栏代码块与行内标记），
 * 那两项是迁移时补的，这里一并保留。
 */

import type { ReactNode } from "react";

/** 粗体 / 行内代码 / 链接 三类，其余按纯文本 */
const INLINE_RE = /(\*\*[^*\n]+\*\*|`[^`\n]+`|\[[^\]\n]+\]\([^)\n]+\))/g;

export function parseInline(text: string, keyPrefix: string): ReactNode[] {
  return text.split(INLINE_RE).map((part, i) => {
    const key = `${keyPrefix}-${i}`;
    if (/^\*\*[^*\n]+\*\*$/.test(part)) return <strong key={key}>{part.slice(2, -2)}</strong>;
    if (/^`[^`\n]+`$/.test(part)) return <code key={key}>{part.slice(1, -1)}</code>;
    const link = /^\[([^\]\n]+)\]\(([^)\n]+)\)$/.exec(part);
    if (link) {
      return (
        <a key={key} href={link[2]} target="_blank" rel="noreferrer noopener">
          {link[1]}
        </a>
      );
    }
    return part;
  });
}

/** 按行扫描：围栏代码块 / 标题 / 引用 / 列表 / 空行 / 段落 */
export function renderMarkdown(md: string): ReactNode[] {
  const lines = md.split("\n");
  const out: ReactNode[] = [];
  let key = 0;
  let inCode = false;
  let codeBuf: string[] = [];
  let i = 0;

  const flushCode = () => {
    out.push(
      <pre key={key++} className="md-code">
        {codeBuf.join("\n")}
      </pre>,
    );
    codeBuf = [];
  };

  while (i < lines.length) {
    const line = lines[i];

    if (line.startsWith("```")) {
      if (inCode) {
        flushCode();
        inCode = false;
      } else {
        inCode = true;
      }
      i++;
      continue;
    }
    if (inCode) {
      codeBuf.push(line);
      i++;
      continue;
    }

    if (line.startsWith("### ")) {
      out.push(<h3 key={key++}>{parseInline(line.slice(4), `h3-${key}`)}</h3>);
      i++;
      continue;
    }
    if (line.startsWith("## ")) {
      out.push(<h2 key={key++}>{parseInline(line.slice(3), `h2-${key}`)}</h2>);
      i++;
      continue;
    }
    if (line.startsWith("# ")) {
      out.push(<h1 key={key++}>{parseInline(line.slice(2), `h1-${key}`)}</h1>);
      i++;
      continue;
    }
    if (line.startsWith("> ")) {
      out.push(
        <blockquote key={key++} className="md-quote">
          {parseInline(line.slice(2), `q-${key}`)}
        </blockquote>,
      );
      i++;
      continue;
    }

    // 列表：连续同类行合成一个块
    const isUl = line.startsWith("- ") || line.startsWith("* ");
    const isOl = /^\d+\.\s/.test(line);
    if (isUl || isOl) {
      const items: string[] = [];
      while (i < lines.length) {
        const cur = lines[i];
        if (isUl && (cur.startsWith("- ") || cur.startsWith("* "))) items.push(cur.slice(2));
        else if (isOl && /^\d+\.\s/.test(cur)) items.push(cur.replace(/^\d+\.\s/, ""));
        else break;
        i++;
      }
      const listKey = key++;
      out.push(
        isUl ? (
          <ul key={listKey}>
            {items.map((it, n) => (
              <li key={n}>{parseInline(it, `li-${listKey}-${n}`)}</li>
            ))}
          </ul>
        ) : (
          <ol key={listKey}>
            {items.map((it, n) => (
              <li key={n}>{parseInline(it, `li-${listKey}-${n}`)}</li>
            ))}
          </ol>
        ),
      );
      continue;
    }

    if (line.trim() === "") {
      out.push(<div key={key++} className="md-gap" />);
      i++;
      continue;
    }

    out.push(<p key={key++}>{parseInline(line, `p-${key}`)}</p>);
    i++;
  }

  if (inCode) flushCode(); // 未闭合的围栏也要出块，别把内容吞掉
  return out;
}

/** 摘要兜底：后端 summary/excerpt 都为空时，从正文开头截一段纯文本 */
export function excerptFrom(content: string, max = 96): string {
  const plain = content
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/^[#>\-\*\d\.\s]+/gm, " ")
    .replace(/[`*_\[\]]/g, "")
    .replace(/\s+/g, " ")
    .trim();
  return plain.length > max ? `${plain.slice(0, max)}…` : plain;
}

/** 阅读时长（500 字/分钟），与编辑器、博客卡片同一算法 */
export function readMinutes(content: string): number {
  const n = content.replace(/\s+/g, "").length;
  return Math.max(1, Math.ceil(n / 500));
}
