export interface SyncProvider {
  readonly type: 'webdav' | 'git' | 's3'

  connect(url: string, credentials?: { username?: string; password?: string; token?: string }): Promise<boolean>
  disconnect(): Promise<void>
  isConnected(): boolean

  upload(localPath: string, remotePath: string): Promise<void>
  download(remotePath: string, localPath: string): Promise<ArrayBuffer>
  list(remoteDir: string): Promise<Array<{ path: string; isDir: boolean; lastModified?: number }>>
}

export class WebDAVSyncProvider implements SyncProvider {
  readonly type = 'webdav' as const
  private connected = false

  async connect(_url: string, _credentials?: { username?: string; password?: string; token?: string }): Promise<boolean> {
    this.connected = true
    return true
  }

  async disconnect(): Promise<void> {
    this.connected = false
  }

  isConnected(): boolean {
    return this.connected
  }

  async upload(_localPath: string, _remotePath: string): Promise<void> {
    throw new Error('WebDAV upload: stub implementation')
  }

  async download(_remotePath: string, _localPath: string): Promise<ArrayBuffer> {
    throw new Error('WebDAV download: stub implementation')
  }

  async list(_remoteDir: string): Promise<Array<{ path: string; isDir: boolean; lastModified?: number }>> {
    return []
  }
}

export const webdavSync = new WebDAVSyncProvider()
