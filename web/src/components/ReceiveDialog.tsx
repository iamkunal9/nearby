import { useEffect, useState } from "react";
import type { ReceivedItem } from "../store/useStore";

interface Props {
  item: ReceivedItem;
  onDismiss: () => void;
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function isUrl(text: string): boolean {
  try {
    const url = new URL(text.trim());
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
}

export function ReceiveDialog({ item, onDismiss }: Props) {
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (item.kind === "file" && item.blob.type.startsWith("image/")) {
      const url = URL.createObjectURL(item.blob);
      setPreviewUrl(url);
      return () => URL.revokeObjectURL(url);
    }
    setPreviewUrl(null);
  }, [item]);

  useEffect(() => {
    setCopied(false);
  }, [item]);

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") onDismiss();
    }
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [onDismiss]);

  function handleDownload() {
    if (item.kind !== "file") return;
    const url = URL.createObjectURL(item.blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = item.name;
    a.click();
    URL.revokeObjectURL(url);
    onDismiss();
  }

  function handleCopy() {
    if (item.kind !== "text") return;
    navigator.clipboard.writeText(item.content).then(
      () => setCopied(true),
      () => {}
    );
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink/40 p-4" onClick={onDismiss}>
      <div
        className="bg-canvas-raised border border-canvas-deep rounded-xl p-5 w-full max-w-[min(90vw,380px)] flex flex-col gap-3 shadow-2xl"
        onClick={(event) => event.stopPropagation()}
      >
        <p className="text-xs text-ink-faint">From {item.peerName}</p>

        {item.kind === "file" && (
          <>
            {previewUrl && (
              <img src={previewUrl} alt={item.name} className="rounded-lg max-h-[45vh] w-full object-contain" />
            )}
            <p className="font-serif text-[15px] text-ink break-all">{item.name}</p>
            <p className="text-xs text-ink-faint">{formatBytes(item.blob.size)}</p>
            <button
              type="button"
              onClick={handleDownload}
              className="bg-accent hover:bg-accent-strong text-canvas-raised text-[13px] font-semibold rounded-lg py-2.5 transition-colors"
            >
              Download
            </button>
          </>
        )}

        {item.kind === "text" && (
          <>
            {isUrl(item.content) ? (
              <a
                href={item.content.trim()}
                target="_blank"
                rel="noopener noreferrer"
                className="text-accent text-sm break-all underline"
              >
                {item.content}
              </a>
            ) : (
              <p className="text-ink text-sm break-all whitespace-pre-wrap">{item.content}</p>
            )}
            <button
              type="button"
              onClick={handleCopy}
              className="bg-accent hover:bg-accent-strong text-canvas-raised text-[13px] font-semibold rounded-lg py-2.5 transition-colors"
            >
              {copied ? "Copied" : "Copy"}
            </button>
          </>
        )}

        <button
          type="button"
          onClick={onDismiss}
          className="text-ink-faint hover:text-ink text-xs self-start"
        >
          Close
        </button>
      </div>
    </div>
  );
}
