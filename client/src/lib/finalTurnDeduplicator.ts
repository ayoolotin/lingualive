export interface FinalTurnIdentity {
  turn_order?: number
  end_of_turn: boolean
}

export class FinalTurnDeduplicator {
  private readonly finalTurnOrders = new Set<number>()

  reset(): void {
    this.finalTurnOrders.clear()
  }

  shouldCommit(turn: FinalTurnIdentity): boolean {
    if (!turn.end_of_turn) return false

    if (
      typeof turn.turn_order !== 'number' ||
      !Number.isInteger(turn.turn_order) ||
      turn.turn_order < 0
    ) {
      // The protocol payload does not provide a duplicate-safe event ID.
      // Processing it is safer than text-based deduplication, which could
      // suppress legitimate repeated utterances.
      return true
    }

    if (this.finalTurnOrders.has(turn.turn_order)) return false
    this.finalTurnOrders.add(turn.turn_order)
    return true
  }
}
