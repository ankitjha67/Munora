// Shared types for the statement-import pipeline.

export type SourceKind = 'pdf' | 'csv' | 'text' | 'image'

export interface RawInput {
  fileName: string
  kind: SourceKind
  /** Extracted text (PDF/CSV/image) or raw pasted text. */
  text: string
  /** True when OCR was used because the PDF had no embedded text. */
  ocrUsed?: boolean
}

/** A candidate transaction produced by the parser, before categorization. */
export interface ParsedRow {
  id: string
  date: string // YYYY-MM-DD
  description: string
  amount: number // negative = money out
  balanceAfter?: number
  raw: string
}

export interface CategorizedRow extends ParsedRow {
  merchant: string
  categoryId?: string
  confidence: 'high' | 'low'
  source: 'rule' | 'history' | 'kb' | 'llm' | 'none'
  transfer?: boolean
  duplicate?: boolean
  /** User can flip this off to skip importing the row. */
  include: boolean
}

export interface DetectedFormat {
  bank: string
  region: 'US' | 'IN' | 'UK' | 'INTL'
  dateOrder: 'dmy' | 'mdy' | 'ymd'
  currency?: string
}

export type StageId = 'ingest' | 'detect' | 'extract' | 'normalize' | 'dedupe' | 'categorize' | 'review' | 'commit'

export interface StageResult {
  id: StageId
  label: string
  detail: string
  ok: boolean
}

export interface PipelineState {
  input: RawInput
  format?: DetectedFormat
  rows: CategorizedRow[]
  stages: StageResult[]
}
