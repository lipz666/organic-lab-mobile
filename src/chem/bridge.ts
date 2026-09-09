/**
 * RN 与 WebView 里 RDKit 之间的通道。
 *
 * Hermes 没有 WebAssembly，所以 RDKit 只能跑在 WebView 里。这个单例负责：
 * 把调用编号发进去、把结果配对回来、在 RDKit 还没加载完时让调用排队等待
 * （而不是失败——app 刚启动时用户就可能问一个需要标准化的问题）。
 */

export type BridgeState = "loading" | "ready" | "failed" | "unsupported";

type Pending = {
  resolve: (value: unknown) => void;
  reject: (error: Error) => void;
};

/** 加载 7MB wasm 在旧手机上要几秒；超过这个时间就认为坏了，别让调用永远悬着。 */
const READY_TIMEOUT_MS = 30_000;

class RdkitBridge {
  private pending = new Map<number, Pending>();
  private sequence = 0;
  private post: ((script: string) => void) | null = null;
  private state: BridgeState = "loading";
  private failure: string | null = null;
  private version: string | null = null;
  private waiters: (() => void)[] = [];
  private listeners: (() => void)[] = [];

  get status(): BridgeState {
    return this.state;
  }

  get rdkitVersion(): string | null {
    return this.version;
  }

  get failureReason(): string | null {
    return this.failure;
  }

  /** 状态变化时通知 UI。设置页用它显示 RDKit 到底起没起来。 */
  subscribe(listener: () => void): () => void {
    this.listeners.push(listener);
    return () => {
      this.listeners = this.listeners.filter((entry) => entry !== listener);
    };
  }

  attach(post: (script: string) => void): void {
    this.post = post;
  }

  detach(): void {
    this.post = null;
    this.state = "loading";
    this.version = null;
    for (const pending of this.pending.values()) pending.reject(new Error("RDKit 视图已卸载"));
    this.pending.clear();
  }

  markUnsupported(reason: string): void {
    this.state = "unsupported";
    this.failure = reason;
    this.release();
  }

  handleMessage(raw: string): void {
    let payload: { type?: string; id?: number; value?: unknown; error?: string; version?: string };
    try {
      payload = JSON.parse(raw);
    } catch {
      return;
    }

    if (payload.type === "ready") {
      this.state = "ready";
      this.version = payload.version ?? null;
      this.release();
      return;
    }
    if (payload.type === "failed") {
      this.state = "failed";
      this.failure = payload.error ?? "RDKit 加载失败";
      this.release();
      return;
    }
    if (payload.type === "result" && typeof payload.id === "number") {
      const pending = this.pending.get(payload.id);
      if (!pending) return;
      this.pending.delete(payload.id);
      pending.resolve(payload.value);
    }
  }

  private release(): void {
    for (const waiter of this.waiters) waiter();
    this.waiters = [];
    for (const listener of this.listeners) listener();
  }

  private waitForReady(): Promise<void> {
    if (this.state !== "loading") return Promise.resolve();
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.state = "failed";
        this.failure = "RDKit 在 30 秒内没有加载完成";
        reject(new Error(this.failure));
      }, READY_TIMEOUT_MS);
      this.waiters.push(() => {
        clearTimeout(timer);
        resolve();
      });
    });
  }

  async call(op: string, args: Record<string, unknown>): Promise<unknown> {
    await this.waitForReady();
    if (this.state !== "ready" || !this.post) {
      throw new Error(this.failure ?? "RDKit 不可用");
    }

    const id = (this.sequence += 1);
    const script = `window.__dispatch(${id}, ${JSON.stringify(op)}, ${JSON.stringify(args)}); true;`;
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      this.post!(script);
    });
  }
}

export const rdkitBridge = new RdkitBridge();
