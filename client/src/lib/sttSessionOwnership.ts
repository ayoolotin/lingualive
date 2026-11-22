export class SttSessionOwnership {
  private activeId = 0

  get activeSessionId(): number {
    return this.activeId
  }

  beginSession(): number {
    this.activeId++
    return this.activeId
  }

  isActive(sessionId: number): boolean {
    return sessionId === this.activeId
  }

  invalidateActiveSession(): void {
    this.activeId++
  }
}
