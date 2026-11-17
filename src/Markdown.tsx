import { isValidElement, memo, useEffect, useId, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import DOMPurify from "dompurify";
function Diagram({ code, streaming }: { code: string; streaming: boolean }) {
  const id = useId().replace(/[^a-zA-Z0-9]/g, "");
  const [svg, setSvg] = useState("");
  const [error, setError] = useState(false);
  useEffect(() => {
    if (streaming) return;
    let active = true;
    setError(false);
    (async () => {
      try {
        const { default: mermaid } = await import("mermaid");
        mermaid.initialize({
          startOnLoad: false,
          securityLevel: "strict",
          theme: "neutral",
          fontFamily: "system-ui",
          htmlLabels: false,
          flowchart: { htmlLabels: false },
          suppressErrorRendering: true,
        });
        const result = await mermaid.render(`diagram${id}${Date.now()}`, code);
        // SVG-only sanitization intentionally removes foreignObject. Native SVG
        // labels preserve text safely, and the viewBox supplies a readable size.
        const document = new DOMParser().parseFromString(result.svg, "image/svg+xml");
        const element = document.documentElement;
        const bounds = element.getAttribute("viewBox")?.split(/[ ,]+/).map(Number);
        if (bounds?.length === 4 && bounds[2] > 0 && bounds[3] > 0) {
          element.setAttribute("width", String(bounds[2]));
          element.setAttribute("height", String(bounds[3]));
          element.style.maxWidth = "none";
        }
        if (active)
          setSvg(
            DOMPurify.sanitize(element.outerHTML, {
              USE_PROFILES: { svg: true, svgFilters: true },
            }),
          );
      } catch {
        if (active) setError(true);
      }
    })();
    return () => {
      active = false;
    };
  }, [code, streaming, id]);
  return svg && !streaming && !error ? (
    <div className="diagram" dangerouslySetInnerHTML={{ __html: svg }} />
  ) : (
    <div>
      <pre>
        <code>{code}</code>
      </pre>
      {error && <small>图表语法暂时无法解析，已保留源码。</small>}
      {streaming && <small>生成完成后显示图表</small>}
    </div>
  );
}
export const Markdown = memo(function Markdown({
  content,
  streaming = false,
}: {
  content: string;
  streaming?: boolean;
}) {
  return (
    <div className="markdown">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          pre({ children }) {
            const child = Array.isArray(children) ? children[0] : children;
            return isValidElement<{ className?: string }>(child) &&
              child.props.className === "language-mermaid" ? (
              <div>{children}</div>
            ) : (
              <pre>{children}</pre>
            );
          },
          code({ className, children, ...props }) {
            const code = String(children).replace(/\n$/, "");
            return className === "language-mermaid" ? (
              <Diagram code={code} streaming={streaming} />
            ) : (
              <code className={className} {...props}>
                {children}
              </code>
            );
          },
          a({ children, ...props }) {
            return (
              <a {...props} target="_blank" rel="noreferrer">
                {children}
              </a>
            );
          },
        }}
      >
        {content}
      </ReactMarkdown>
    </div>
  );
});
