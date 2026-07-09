import { useEffect, useRef, useState } from "react";

interface Props {
  autoDownload: boolean;
  onAutoDownloadChange: (value: boolean) => void;
  onEnableNotifications: () => void;
}

export function SettingsMenu({ autoDownload, onAutoDownloadChange, onEnableNotifications }: Props) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleOutsideClick(event: MouseEvent) {
      if (rootRef.current && !rootRef.current.contains(event.target as Node)) {
        setOpen(false);
      }
    }
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") setOpen(false);
    }
    document.addEventListener("click", handleOutsideClick);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("click", handleOutsideClick);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, []);

  return (
    <div className="relative" ref={rootRef}>
      <button
        type="button"
        aria-label="Settings"
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
        className="w-10 h-10 rounded-full flex items-center justify-center border transition-colors"
        style={{
          borderColor: open ? "var(--accent)" : "var(--canvas-deep)",
          color: open ? "var(--accent)" : "var(--ink-soft)",
        }}
      >
        <svg viewBox="0 0 24 24" className="w-[18px] h-[18px]" fill="none">
          <circle cx="12" cy="12" r="3" stroke="currentColor" strokeWidth="1.8" />
          <path
            d="M19.4 13a7.9 7.9 0 000-2l2-1.5-2-3.4-2.3.9a7.9 7.9 0 00-1.7-1l-.3-2.5H9.9l-.3 2.5a7.9 7.9 0 00-1.7 1l-2.3-.9-2 3.4 2 1.5a7.9 7.9 0 000 2l-2 1.5 2 3.4 2.3-.9a7.9 7.9 0 001.7 1l.3 2.5h4.2l.3-2.5a7.9 7.9 0 001.7-1l2.3.9 2-3.4z"
            stroke="currentColor"
            strokeWidth="1.4"
            strokeLinejoin="round"
          />
        </svg>
      </button>

      {open && (
        <div
          className="absolute right-0 top-[calc(100%+10px)] w-64 rounded-xl p-4 flex flex-col gap-4 shadow-2xl z-20"
          style={{ background: "var(--canvas-raised)", border: "1px solid var(--canvas-deep)" }}
        >
          <label className="flex items-center justify-between gap-3 cursor-pointer select-none">
            <span className="text-[13px]" style={{ color: "var(--ink)" }}>
              Auto-download files
            </span>
            <span className="relative inline-block w-9 h-5 shrink-0">
              <input
                type="checkbox"
                className="peer sr-only"
                checked={autoDownload}
                onChange={(event) => onAutoDownloadChange(event.target.checked)}
              />
              <span
                className="absolute inset-0 rounded-full transition-colors duration-150 pointer-events-none peer-focus-visible:[box-shadow:0_0_0_2px_var(--canvas-raised),0_0_0_4px_var(--accent)]"
                style={{ background: autoDownload ? "var(--accent)" : "var(--canvas-deep)" }}
              />
              <span
                className="absolute top-0.5 left-0.5 w-4 h-4 rounded-full transition-transform duration-150 pointer-events-none"
                style={{
                  background: "var(--canvas-raised)",
                  transform: autoDownload ? "translateX(16px)" : "translateX(0)",
                  boxShadow: "0 1px 2px rgba(0,0,0,0.25)",
                }}
              />
            </span>
          </label>

          <button
            type="button"
            onClick={() => {
              onEnableNotifications();
              setOpen(false);
            }}
            className="text-left text-[13px] underline underline-offset-2 transition-colors"
            style={{ color: "var(--ink-soft)" }}
          >
            Enable notifications
          </button>
        </div>
      )}
    </div>
  );
}
