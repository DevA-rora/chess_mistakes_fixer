import { type ReactNode, Fragment, isValidElement, useMemo } from "react";
import ReactMarkdown from "react-markdown";
import { PlayCircle } from "lucide-react";
import { parseChessReferences } from "@/lib/chess-notation-parser";

interface MarkdownMessageProps {
  content: string;
  className?: string;
  /** When provided, enables interactive chess references in the message */
  currentFen?: string;
  /** FEN after the current move — helps resolve future move references */
  afterMoveFen?: string;
  onSquaresHover?: (squares: string[]) => void;
  onSquaresClear?: () => void;
  onLineClick?: (moves: string[], fromFen: string) => void;
  onMoveClick?: (fromSquare: string, toSquare: string) => void;
  onSquareClick?: (square: string) => void;
}

/** Renders a single text node with chess square/move/line interactivity. */
function InteractiveText({
  text,
  currentFen,
  afterMoveFen,
  onSquaresHover,
  onSquaresClear,
  onLineClick,
  onMoveClick,
  onSquareClick,
}: {
  text: string;
  currentFen: string;
  afterMoveFen?: string;
  onSquaresHover?: (squares: string[]) => void;
  onSquaresClear?: () => void;
  onLineClick?: (moves: string[], fromFen: string) => void;
  onMoveClick?: (fromSquare: string, toSquare: string) => void;
  onSquareClick?: (square: string) => void;
}) {
  const segments = useMemo(
    () => parseChessReferences(text, currentFen, afterMoveFen),
    [text, currentFen, afterMoveFen]
  );

  return (
    <>
      {segments.map((seg, i) => {
        if (seg.type === "text") {
          return <span key={i}>{seg.value}</span>;
        }
        if (seg.type === "square" || seg.type === "move") {
          const handleClick = () => {
            if (seg.type === "move" && seg.fromSquare) {
              onMoveClick?.(seg.fromSquare, seg.square);
            } else {
              onSquareClick?.(seg.square);
            }
          };
          return (
            <span
              key={i}
              className="underline decoration-dotted cursor-pointer text-blue-300 transition-colors hover:text-blue-100"
              onMouseEnter={() => onSquaresHover?.([seg.square])}
              onMouseLeave={() => onSquaresClear?.()}
              onClick={handleClick}
            >
              {seg.value}
            </span>
          );
        }
        if (seg.type === "line") {
          return (
            <button
              key={i}
              className="inline-flex items-center gap-1 mx-0.5 my-0.5 px-2 py-0.5 rounded-full bg-blue-950 border border-blue-700 text-blue-200 text-xs font-mono hover:bg-blue-900 hover:border-blue-500 transition-colors cursor-pointer"
              onClick={() => onLineClick?.(seg.moves, seg.fromFen)}
              title="Click to preview this line on the board"
            >
              <PlayCircle className="h-2.5 w-2.5 shrink-0" />
              {seg.value}
            </button>
          );
        }
        return null;
      })}
    </>
  );
}

/**
 * Walk `children` and replace any bare string children with `<InteractiveText>`.
 * Non-string children (React elements like <strong>) pass through unchanged.
 */
function processChildren(
  children: ReactNode,
  currentFen: string,
  afterMoveFen: string | undefined,
  onSquaresHover?: (squares: string[]) => void,
  onSquaresClear?: () => void,
  onLineClick?: (moves: string[], fromFen: string) => void,
  onMoveClick?: (fromSquare: string, toSquare: string) => void,
  onSquareClick?: (square: string) => void,
): ReactNode {
  const renderInteractiveText = (text: string, keyPrefix: string): ReactNode => (
    <Fragment key={keyPrefix}>
      <InteractiveText
        text={text}
        currentFen={currentFen}
        afterMoveFen={afterMoveFen}
        onSquaresHover={onSquaresHover}
        onSquaresClear={onSquaresClear}
        onLineClick={onLineClick}
        onMoveClick={onMoveClick}
        onSquareClick={onSquareClick}
      />
    </Fragment>
  );

  if (typeof children === "string") {
    return renderInteractiveText(children, "text");
  }
  if (Array.isArray(children)) {
    const out: ReactNode[] = [];
    let textBuffer = "";
    let keyCounter = 0;

    const flushBuffer = () => {
      if (!textBuffer) return;
      out.push(renderInteractiveText(textBuffer, `seg-${keyCounter++}`));
      textBuffer = "";
    };

    for (const child of children) {
      if (typeof child === "string") {
        textBuffer += child;
        continue;
      }

      // Keep hard line breaks in the text buffer so numbered lines across
      // visual breaks are parsed as one continuous chess line.
      if (isValidElement(child) && child.type === "br") {
        textBuffer += "\n";
        continue;
      }

      flushBuffer();
      out.push(child);
    }

    flushBuffer();
    return out;
  }
  return children;
}

export function MarkdownMessage({
  content,
  className,
  currentFen,
  afterMoveFen,
  onSquaresHover,
  onSquaresClear,
  onLineClick,
  onMoveClick,
  onSquareClick,
}: MarkdownMessageProps) {
  const interactive = !!currentFen;

  const proc = (children: ReactNode) =>
    interactive && currentFen
      ? processChildren(children, currentFen, afterMoveFen, onSquaresHover, onSquaresClear, onLineClick, onMoveClick, onSquareClick)
      : children;

  return (
    <div className={className}>
      <ReactMarkdown
        components={{
          p: ({ children }) => (
            <p className="mb-1 last:mb-0">{proc(children)}</p>
          ),
          strong: ({ children }) => (
            <strong className="font-semibold">{children}</strong>
          ),
          em: ({ children }) => <em className="italic">{children}</em>,
          ul: ({ children }) => (
            <ul className="list-disc list-inside space-y-0.5 mb-1">{children}</ul>
          ),
          ol: ({ children }) => (
            <ol className="list-decimal list-inside space-y-0.5 mb-1">{children}</ol>
          ),
          li: ({ children }) => <li>{proc(children)}</li>,
          h1: ({ children }) => (
            <p className="font-semibold mb-1">{children}</p>
          ),
          h2: ({ children }) => (
            <p className="font-semibold mb-1">{children}</p>
          ),
          h3: ({ children }) => (
            <p className="font-semibold mb-1">{children}</p>
          ),
          code: ({ children }) => (
            <code className="bg-black/20 rounded px-1 py-0.5 font-mono text-[0.85em]">
              {children}
            </code>
          ),
        }}
      >
        {content}
      </ReactMarkdown>
    </div>
  );
}
