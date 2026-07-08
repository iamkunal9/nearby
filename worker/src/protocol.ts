export interface PeerInfo {
  id: string;
  name: string;
}

export type ClientMessage =
  | { type: "signal"; target: string; data: SignalPayload };

export type ServerMessage =
  | { type: "peers"; peers: PeerInfo[] }
  | { type: "peer-joined"; peer: PeerInfo }
  | { type: "peer-left"; peerId: string }
  | { type: "signal"; from: string; data: SignalPayload };

export type SignalPayload =
  | { kind: "offer"; sdp: string }
  | { kind: "answer"; sdp: string }
  | { kind: "ice-candidate"; candidate: RTCIceCandidateInit };
