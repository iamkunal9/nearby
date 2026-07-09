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
    if (item.kind === "text" && !isUrl(item.content)) {
      navigator.clipboard.writeText(item.content).then(
        () => setCopied(true),
        () => {}
      );
    }
  }, [item]);

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

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
      <div className="bg-slate-800 border border-slate-600 rounded-lg p-5 w-80 flex flex-col gap-3">
        <p className="text-slate-300 text-xs">From {item.peerName}</p>

        {item.kind === "file" && (
          <>
            {previewUrl && <img src={previewUrl} alt={item.name} className="rounded max-h-40 object-contain" />}
            <p className="text-white text-sm break-all">{item.name}</p>
            <p className="text-slate-400 text-xs">{formatBytes(item.blob.size)}</p>
            <button
              type="button"
              onClick={handleDownload}
              className="bg-sky-500 hover:bg-sky-400 text-white text-sm rounded py-1.5 transition-colors"
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
                className="text-sky-400 text-sm break-all underline"
              >
                {item.content}
              </a>
            ) : (
              <p className="text-white text-sm break-all whitespace-pre-wrap">{item.content}</p>
            )}
            {copied && <p className="text-emerald-400 text-xs">Copied to clipboard</p>}
          </>
        )}

        <button
          type="button"
          onClick={onDismiss}
          className="text-slate-400 hover:text-slate-200 text-xs"
        >
          Close
        </button>
      </div>
    </div>
  );
}
