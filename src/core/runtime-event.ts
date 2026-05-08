export interface RuntimeEvent {
  type: string
  source: string
  timestamp: number
  payload?: unknown
}
