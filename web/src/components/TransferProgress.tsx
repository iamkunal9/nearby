import type { TransferState } from "../store/useStore";

interface Props {
  transfer: TransferState;
}

export function TransferProgress({ transfer }: Props) {
  const percent = transfer.fileSize === 0 ? 0 : Math.round((transfer.bytesTransferred / transfer.fileSize) * 100);

  return (
    <div className="w-full">
      <div className="flex justify-between text-sm text-slate-300 mb-1">
        <span>
          {transfer.direction === "send" ? "Sending" : "Receiving"} {transfer.fileName}
        </span>
        <span>{percent}%</span>
      </div>
      <div className="w-full h-2 bg-slate-700 rounded-full overflow-hidden">
        <div className="h-full bg-sky-400" style={{ width: `${percent}%` }} />
      </div>
    </div>
  );
}
