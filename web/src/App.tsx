import { useEffect, useRef } from "react";
import { useStore } from "./store/useStore";
import { SignalingClient } from "./lib/signaling";
import { PeerConnection } from "./lib/webrtc";
import { notifyReceived, playBlop, requestNotificationPermission } from "./lib/notifications";
import { PeerRadar } from "./components/PeerRadar";
import { ReceiveDialog } from "./components/ReceiveDialog";
import type { PeerInfo } from "./lib/protocol";

const SIGNALING_URL = import.meta.env.VITE_SIGNALING_URL ?? "ws://localhost:8787/room";

export default function App() {
  const {
    myPeerId,
    myDeviceName,
    peers,
    transfers,
    receiveQueue,
    autoDownload,
    setPeers,
    addPeer,
    removePeer,
    upsertTransfer,
    enqueueReceived,
    dequeueReceived,
    setAutoDownload,
  } = useStore();
  const signalingRef = useRef<SignalingClient | null>(null);
  const connectionsRef = useRef<Map<string, PeerConnection>>(new Map());
  const peersRef = useRef<PeerInfo[]>(peers);
  peersRef.current = peers;
  const autoDownloadRef = useRef(autoDownload);
  autoDownloadRef.current = autoDownload;

  useEffect(() => {
    const client = new SignalingClient(SIGNALING_URL, myPeerId, myDeviceName);
    signalingRef.current = client;

    client.onMessage = (message) => {
      if (message.type === "peers") setPeers(message.peers);
      if (message.type === "peer-joined") addPeer(message.peer);
      if (message.type === "peer-left") removePeer(message.peerId);
      if (message.type === "signal") {
        void handleSignal(message.from, message.data);
      }
    };

    client.connect();
    return () => client.close();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    function handlePaste(event: ClipboardEvent) {
      if (peersRef.current.length !== 1) return;
      const item = Array.from(event.clipboardData?.items ?? []).find((entry) => entry.type.startsWith("image/"));
      if (!item) return;
      const file = item.getAsFile();
      if (!file) return;
      void handleSendFile(peersRef.current[0], file);
    }

    window.addEventListener("paste", handlePaste);
    return () => window.removeEventListener("paste", handlePaste);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function peerNameFor(peerId: string): string {
    return peersRef.current.find((peer) => peer.id === peerId)?.name ?? "Unknown device";
  }

  function getOrCreateConnection(peerId: string): PeerConnection {
    const existing = connectionsRef.current.get(peerId);
    if (existing) return existing;

    const connection = new PeerConnection((candidate) => {
      signalingRef.current?.send({
        type: "signal",
        target: peerId,
        data: { kind: "ice-candidate", candidate },
      });
    });
    connection.onFileReceived = (blob, name) => {
      playBlop();
      notifyReceived("File received", `${name} from ${peerNameFor(peerId)}`);
      if (autoDownloadRef.current) {
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = name;
        a.click();
        URL.revokeObjectURL(url);
        return;
      }
      enqueueReceived({ kind: "file", blob, name, peerName: peerNameFor(peerId) });
    };
    connection.onProgress = (received, total) => {
      upsertTransfer({
        peerId,
        fileName: "incoming file",
        fileSize: total,
        bytesTransferred: received,
        direction: "receive",
        status: received >= total ? "complete" : "in-progress",
      });
    };
    connection.onTextReceived = (text) => {
      playBlop();
      notifyReceived("Text received", `From ${peerNameFor(peerId)}`);
      enqueueReceived({ kind: "text", content: text, peerName: peerNameFor(peerId) });
    };

    connectionsRef.current.set(peerId, connection);
    return connection;
  }

  async function handleSignal(fromPeerId: string, data: import("./lib/protocol").SignalPayload) {
    const connection = getOrCreateConnection(fromPeerId);
    if (data.kind === "offer") {
      const answerSdp = await connection.acceptOffer(data.sdp);
      signalingRef.current?.send({ type: "signal", target: fromPeerId, data: { kind: "answer", sdp: answerSdp } });
    } else if (data.kind === "answer") {
      await connection.acceptAnswer(data.sdp);
    } else if (data.kind === "ice-candidate") {
      await connection.addIceCandidate(data.candidate);
    }
  }

  async function handleSendFile(peer: PeerInfo, file: File) {
    const connection = getOrCreateConnection(peer.id);
    const offerSdp = await connection.createOffer();
    signalingRef.current?.send({ type: "signal", target: peer.id, data: { kind: "offer", sdp: offerSdp } });

    await connection.sendFile(file, (bytesSent) => {
      upsertTransfer({
        peerId: peer.id,
        fileName: file.name,
        fileSize: file.size,
        bytesTransferred: bytesSent,
        direction: "send",
        status: bytesSent >= file.size ? "complete" : "in-progress",
      });
    });
  }

  async function handleSendText(peer: PeerInfo, text: string) {
    const connection = getOrCreateConnection(peer.id);
    const offerSdp = await connection.createOffer();
    signalingRef.current?.send({ type: "signal", target: peer.id, data: { kind: "offer", sdp: offerSdp } });
    await connection.sendText(text);
  }

  return (
    <div className="min-h-screen bg-[radial-gradient(circle_at_center,_#1e3a5f_0%,_#0f1d33_60%,_#080f1c_100%)] text-white flex items-center justify-center p-8">
      <div className="absolute top-4 right-4 flex items-center gap-3 text-xs text-slate-300">
        <label className="flex items-center gap-1.5">
          <input
            type="checkbox"
            checked={autoDownload}
            onChange={(event) => setAutoDownload(event.target.checked)}
          />
          Auto-download files
        </label>
        <button
          type="button"
          onClick={() => void requestNotificationPermission()}
          className="underline hover:text-white"
        >
          Enable notifications
        </button>
      </div>

      <PeerRadar
        myDeviceName={myDeviceName}
        peers={peers}
        transfers={transfers}
        onSendFile={handleSendFile}
        onSendText={handleSendText}
      />

      {receiveQueue[0] && <ReceiveDialog item={receiveQueue[0]} onDismiss={dequeueReceived} />}
    </div>
  );
}
