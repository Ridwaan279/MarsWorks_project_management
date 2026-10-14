"use client";

import { useEffect, useLayoutEffect, useRef } from "react";
import clsx from "clsx";

// Measured before paint in the browser, so the box never shows at the wrong
// size for a frame; a plain effect on the server, where there is nothing to
// measure.
const useBeforePaint = typeof window === "undefined" ? useEffect : useLayoutEffect;

/**
 * A textarea that grows to fit what is written in it.
 *
 * A fixed three-line box turned every real description into a scroll inside
 * a scroll. This one is as tall as its text -- `rows` is only the starting
 * height -- and the page or panel around it does the scrolling.
 */
export function AutoGrowTextarea({
  value,
  className,
  ...props
}: React.TextareaHTMLAttributes<HTMLTextAreaElement> & { value: string }) {
  const ref = useRef<HTMLTextAreaElement>(null);

  useBeforePaint(() => {
    const el = ref.current;
    if (!el) return;
    const fit = () => {
      el.style.height = "auto";
      // scrollHeight leaves out the borders, which the height includes.
      el.style.height = `${el.scrollHeight + el.offsetHeight - el.clientHeight}px`;
    };
    fit();
    // The same text takes more lines when the box narrows.
    window.addEventListener("resize", fit);
    return () => window.removeEventListener("resize", fit);
  }, [value]);

  return (
    <textarea
      ref={ref}
      value={value}
      className={clsx(className, "resize-none overflow-hidden")}
      {...props}
    />
  );
}
