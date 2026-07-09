import { useEffect, useRef, useState } from "react";

interface Props {
  peerName: string;
  position: { left: string; top: string };
  onSend: (text: string) => void;
  onClose: () => void;
}

export function TextDialog({ peerName, position, onSend, onClose }: Props) {
  const [text, setText] = useState("");
  const inputRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
    inputRef.current?.select();
  }, []);

  function handleSend() {
    if (text.trim().length === 0) return;
    onSend(text);
    onClose();
  }

  return (
    <>
      <div className="fixed inset-0 z-40" onClick={onClose} />
      <div
        className="fixed z-50 -translate-x-1/2 flex flex-col gap-2 bg-canvas-raised border border-canvas-deep rounded-xl p-3.5 shadow-2xl w-60"
        style={position}
        onClick={(event) => event.stopPropagation()}
      >
        <p className="font-serif text-[13.5px] text-ink">Send a note to {peerName}</p>
        <textarea
          ref={inputRef}
          value={text}
          onChange={(event) => setText(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Escape") onClose();
            if (event.key === "Enter" && !event.shiftKey) {
              event.preventDefault();
              handleSend();
            }
          }}
          placeholder="Say something…"
          className="bg-canvas text-ink placeholder:text-ink-faint text-[13px] rounded-lg p-2.5 resize-none h-[54px] outline-none border border-canvas-deep focus:border-accent focus:[outline:2px_solid_var(--accent)] focus:outline-offset-1"
        />
        <button
          type="button"
          onClick={handleSend}
          className="bg-accent hover:bg-accent-strong text-canvas-raised text-[13px] font-semibold rounded-lg py-2 transition-colors"
        >
          Send
        </button>
      </div>
    </>
  );
}
