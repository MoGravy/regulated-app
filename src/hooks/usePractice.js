import { useCallback, useEffect, useRef, useState } from 'react'
import { acceptPractice, checkpointAttempt, emptyLedger, loadPractice, projectPractice, retryCredit, savePractice } from '../lib/practiceLedger'

// Access is deferred so a browser storage refusal is caught by the ledger helpers.
const storage = {
  getItem: key => window.localStorage.getItem(key),
  setItem: (key, value) => window.localStorage.setItem(key, value),
}

export function usePractice(scope) {
  const state = useRef(null)
  const [, refresh] = useState(0)
  if (state.current?.scope !== scope) {
    state.current = scope ? { scope, ...loadPractice(storage, scope) }
      : { scope, ledger: emptyLedger(), storageOK: true }
  }
  useEffect(() => {
    if (scope && state.current.scope === scope) {
      state.current.storageOK = savePractice(storage, scope, state.current.ledger)
      refresh(n => n + 1)
    }
  }, [scope])

  const beginPractice = useCallback(mediaId => ({
    ...retryCredit(state.current.ledger, mediaId),
    mediaId, scope,
    attemptId: retryCredit(state.current.ledger, mediaId)?.attemptId || crypto.randomUUID(),
  }), [scope])

  const updatePractice = useCallback((ownerScope, attempt, event) => {
    // Async media callbacks from the old account cannot write into the new one.
    if (!scope || ownerScope !== state.current.scope) return
    let ledger = state.current.ledger
    if (event) ledger = acceptPractice(ledger, event)
    ledger = checkpointAttempt(ledger, attempt)
    state.current = { scope: ownerScope, ledger, storageOK: savePractice(storage, ownerScope, ledger) }
    refresh(n => n + 1)
  }, [scope])

  return {
    practiceScope: scope,
    practiceSummary: projectPractice(state.current.ledger),
    practiceStorageOK: state.current.storageOK,
    beginPractice, updatePractice,
  }
}
