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
        className="fixed z-50 -translate-x-1/2 flex flex-col gap-2 bg-slate-800 border border-slate-600 rounded-lg p-3 shadow-xl w-64"
        style={position}
        onClick={(event) => event.stopPropagation()}
      >
        <p className="text-slate-300 text-xs">Send text to {peerName}</p>
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
          className="bg-slate-900 text-white text-sm rounded p-2 resize-none h-20 outline-none border border-slate-700 focus:border-sky-400"
        />
        <button
          type="button"
          onClick={handleSend}
          className="bg-sky-500 hover:bg-sky-400 text-white text-sm rounded py-1.5 transition-colors"
        >
          Send
        </button>
      </div>
    </>
  );
}
