// One serial network worker; a new send never resets an existing retry deadline.
export function createContentKeyPublicationJobs ({ current, online, onOnline, onError, debug = () => {}, setTimer = setTimeout, clearTimer = clearTimeout, now = Date.now, random = Math.random }) {
  const jobs = new Map()
  let running; let timer; let stopOnline
  function schedule () {
    if (timer) clearTimer(timer)
    timer = null
    const waiting = [...jobs.values()].filter(job => !job.done && current(job.owner, job.key, job.accountPubkey))
    if (!waiting.length) { stopOnline?.(); stopOnline = null; return }
    if (running) return
    const next = Math.min(...waiting.map(job => job.nextAt))
    timer = setTimer(() => { timer = null; pump() }, Math.max(0, next - now()))
    timer?.unref?.()
  }
  function pump () {
    if (running) return running
    const work = Promise.resolve().then(async () => {
      if (!await online()) {
        stopOnline ||= onOnline(() => { stopOnline?.(); stopOnline = null; pump() })
        return
      }
      for (const job of jobs.values()) {
        if (job.done || job.nextAt > now()) continue
        if (!current(job.owner, job.key, job.accountPubkey)) { jobs.delete(job.owner); job.first.resolve({ skipped: 'superseded' }); continue }
        const active = () => jobs.get(job.owner) === job && current(job.owner, job.key, job.accountPubkey) && !job.controller.signal.aborted
        const startedAt = now()
        try {
          const result = await job.run(job.controller.signal)
          if (!active()) continue
          job.done = true; job.result = result; job.expiresAt = now() + 40 * 60 * 1000
          job.first.resolve(result)
          debug({ stage: 'content-key-announced', contentKeyId: job.key, elapsedMs: now() - startedAt })
        } catch (error) {
          if (!active()) continue
          job.first.reject(error)
          onError(error)
          job.nextAt = now() + Math.max(1000, Math.min(30000, job.delay * (0.8 + random() * 0.4)))
          job.delay = Math.min(30000, job.delay * 2)
        }
      }
    }).finally(() => { if (running === work) running = null; if (!stopOnline) schedule() })
    running = work
    work.catch(onError)
    return work
  }
  return {
    request (owner, key, run, { force = false, accountPubkey = owner } = {}) {
      let job = jobs.get(owner)
      if (job && job.key === key && (!job.done || (!force && job.expiresAt > now()))) return job.done ? Promise.resolve(job.result) : job.first.promise
      if (job) { job.controller.abort(); job.first.resolve({ skipped: 'superseded' }) }
      job = { owner, key, accountPubkey, run, first: Promise.withResolvers(), controller: new AbortController(), nextAt: now(), delay: 1000, done: false }
      job.first.promise.catch(() => {})
      jobs.set(owner, job)
      pump()
      return job.first.promise
    },
    reconcile () {
      for (const [owner, job] of jobs) {
        if (!current(owner, job.key, job.accountPubkey)) {
          jobs.delete(owner); job.controller.abort(); job.first.resolve({ skipped: 'superseded' })
        }
      }
      schedule()
    },
    clear () {
      if (timer) clearTimer(timer)
      timer = null; stopOnline?.(); stopOnline = null
      for (const job of jobs.values()) { job.controller.abort(); job.first.resolve({ skipped: 'closed' }) }
      jobs.clear()
    },
    idle: () => running || Promise.resolve()
  }
}
