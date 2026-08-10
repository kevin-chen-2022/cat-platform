import type { LanguageCode, MTProviderConfig } from '@/types'

export interface TranslateSegment {
  id?: string
  source: string
}

export interface TranslateResult {
  id?: string
  source: string
  target: string
  provider: string
}

export interface MTProvider {
  readonly config: MTProviderConfig
  translate(
    segments: TranslateSegment[],
    sourceLang: LanguageCode,
    targetLang: LanguageCode,
  ): Promise<TranslateResult[]>
  testConnection?(): Promise<boolean>
}

export class NotImplementedMT implements MTProvider {
  constructor(public readonly config: MTProviderConfig) {}

  async translate(): Promise<TranslateResult[]> {
    throw new Error(`MT adapter for type '${this.config.type}' not yet implemented`)
  }
}

export function createMTAdapter(config: MTProviderConfig): MTProvider {
  return new NotImplementedMT(config)
}
