declare module 'goeasy' {
  interface GoEasyOptions {
    host: string
    appkey: string
    modules?: string[]
    allowNotification?: boolean
    autoNotificationSwitch?: boolean
  }
  interface ConnectOptions {
    id: string
    data?: unknown
    onSuccess?: () => void
    onFailed?: (err: { code: number; content: string }) => void
  }
  interface CallBackOptions {
    onSuccess?: () => void
    onFailed?: (err: { code: number; content: string }) => void
  }
  interface SubscribeOptions {
    channel: string
    onMessage: (msg: { channel: string; content: string }) => void
    onSuccess?: () => void
    onFailed?: (err: { code: number; content: string }) => void
  }
  interface PublishOptions {
    channel: string
    message: string
    onSuccess?: () => void
    onFailed?: (err: { code: number; content: string }) => void
  }
  interface UnsubscribeOptions {
    channel: string
    onSuccess?: () => void
    onFailed?: (err: { code: number; content: string }) => void
  }
  interface GoEasyStatic {
    getInstance(options: GoEasyOptions): GoEasyStatic
    init(options: GoEasyOptions): void
    connect(options: ConnectOptions): void
    disconnect(options?: CallBackOptions): void
    getConnectionStatus(): string
    pubsub: {
      subscribe(options: SubscribeOptions): void
      unsubscribe(options: UnsubscribeOptions): void
      publish(options: PublishOptions): void
    }
  }
  const GoEasy: GoEasyStatic
  export default GoEasy
}
