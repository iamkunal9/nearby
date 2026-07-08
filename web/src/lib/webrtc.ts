export const CHUNK_SIZE = 16384;
export const BUFFERED_AMOUNT_LOW_THRESHOLD = 1_048_576;

export function chunkCount(fileSize: number, chunkSize: number): number {
  if (fileSize === 0) return 0;
  return Math.ceil(fileSize / chunkSize);
}

const ICE_SERVERS: RTCIceServer[] = [
  { urls: "stun:stun.l.google.com:19302" },
  { urls: "stun:stun.cloudflare.com:3478" },
];

interface FileHeader {
  type: "file-header";
  name: string;
  size: number;
}

export class PeerConnection {
  private pc: RTCPeerConnection;
  private channel: RTCDataChannel | null = null;
  private incomingChunks: ArrayBuffer[] = [];
  private incomingHeader: FileHeader | null = null;
  private incomingBytes = 0;

  onFileReceived: (file: Blob, name: string) => void = () => {};
  onProgress: (bytesReceived: number, totalBytes: number) => void = () => {};

  constructor(private onIceCandidate: (candidate: RTCIceCandidateInit) => void) {
    this.pc = new RTCPeerConnection({ iceServers: ICE_SERVERS });
    this.pc.onicecandidate = (event) => {
      if (event.candidate) this.onIceCandidate(event.candidate.toJSON());
    };
    this.pc.ondatachannel = (event) => {
      this.attachChannel(event.channel);
    };
  }

  async createOffer(): Promise<string> {
    this.attachChannel(this.pc.createDataChannel("file-transfer"));
    const offer = await this.pc.createOffer();
    await this.pc.setLocalDescription(offer);
    return offer.sdp!;
  }

  async acceptOffer(sdp: string): Promise<string> {
    await this.pc.setRemoteDescription({ type: "offer", sdp });
    const answer = await this.pc.createAnswer();
    await this.pc.setLocalDescription(answer);
    return answer.sdp!;
  }

  async acceptAnswer(sdp: string): Promise<void> {
    await this.pc.setRemoteDescription({ type: "answer", sdp });
  }

  async addIceCandidate(candidate: RTCIceCandidateInit): Promise<void> {
    await this.pc.addIceCandidate(candidate);
  }

  async sendFile(file: File, onProgress: (bytesSent: number) => void): Promise<void> {
    const channel = this.channel;
    if (!channel) throw new Error("Data channel not open");

    const header: FileHeader = { type: "file-header", name: file.name, size: file.size };
    channel.send(JSON.stringify(header));

    let offset = 0;
    while (offset < file.size) {
      if (channel.bufferedAmount > BUFFERED_AMOUNT_LOW_THRESHOLD) {
        await new Promise<void>((resolve) => {
          channel.onbufferedamountlow = () => {
            channel.onbufferedamountlow = null;
            resolve();
          };
        });
      }
      const slice = file.slice(offset, offset + CHUNK_SIZE);
      const buffer = await slice.arrayBuffer();
      channel.send(buffer);
      offset += buffer.byteLength;
      onProgress(offset);
    }
  }

  close(): void {
    this.channel?.close();
    this.pc.close();
  }

  private attachChannel(channel: RTCDataChannel): void {
    channel.binaryType = "arraybuffer";
    channel.bufferedAmountLowThreshold = BUFFERED_AMOUNT_LOW_THRESHOLD;
    channel.onmessage = (event) => this.handleIncoming(event.data);
    this.channel = channel;
  }

  private handleIncoming(data: string | ArrayBuffer): void {
    if (typeof data === "string") {
      const header = JSON.parse(data) as FileHeader;
      this.incomingHeader = header;
      this.incomingChunks = [];
      this.incomingBytes = 0;
      return;
    }

    this.incomingChunks.push(data);
    this.incomingBytes += data.byteLength;
    const header = this.incomingHeader;
    if (!header) return;

    this.onProgress(this.incomingBytes, header.size);
    if (this.incomingBytes >= header.size) {
      const blob = new Blob(this.incomingChunks);
      this.onFileReceived(blob, header.name);
      this.incomingChunks = [];
      this.incomingHeader = null;
      this.incomingBytes = 0;
    }
  }
}
