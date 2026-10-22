import type { Point } from './geometry'
import type {
  ConnectCancelReason,
  ConnectConfig,
  ConnectMessage,
  ConnectMessageContext,
  ConnectPortState,
  ConnectRole,
  ConnectVia,
  ConnectionDescriptor,
  ConnectionEndpoint,
  FixedSide,
  VisualLinkerEventMap,
} from './types'

export const HANDLE_MIN_RADIUS = 12
export const DEFAULT_SNAP = 24
const CLICK_TOLERANCE = 4
const AUTO_SCROLL_EDGE = 32
const AUTO_SCROLL_STEP = 14

export interface HandleInfo {
  key: string
  endpoint: ConnectionEndpoint
  role: Exclude<ConnectRole, false>
  point: Point
  side: FixedSide
  el: HTMLElement
  hidden?: boolean
  portKey?: string
  fade?: number
}

export interface BlockGeometry {
  point: Point
  side: FixedSide
}

export interface ConnectHost {
  container: HTMLElement
  config(): ConnectConfig | undefined
  connections(): Iterable<ConnectionDescriptor>
  handles(): readonly HandleInfo[]
  hasBlock(blockId: string): boolean
  hasPort(blockId: string, portId: string): boolean
  blockRole(blockId: string): Exclude<ConnectRole, false> | false
  portRole(blockId: string, portId: string): Exclude<ConnectRole, false> | false
  blockElement(blockId: string): HTMLElement | undefined
  portElement(blockId: string, portId?: string): HTMLElement | undefined
  blockAt(clientX: number, clientY: number): string | undefined
  toLocal(clientX: number, clientY: number): Point
  blockGeometry(blockId: string, towards: Point): BlockGeometry | null
  ignored(target: Element): boolean
  setDim(value: number | null): void
  previewPath(from: BlockGeometry, toPoint: Point, toSide: FixedSide | null): string
  setStates(states: Map<string, ConnectPortState>): void
  setPreview(d: string | null, validity: 'valid' | 'invalid' | null): void
  stylePreview(): void
  announce(text: string): void
  emit<E extends 'connect:start' | 'connect:candidate' | 'connection:create-request' | 'connection:create-cancel'>(
    event: E,
    payload: VisualLinkerEventMap[E],
  ): void
  onStateChange(connecting: boolean): void
}

interface Session {
  from: ConnectionEndpoint
  via: ConnectVia | 'api'
  cursor: Point
  pointerId?: number
  captureEl?: Element
  startX: number
  startY: number
  moved: boolean
  candidate: { endpoint: ConnectionEndpoint; valid: boolean; message?: string; handle?: HandleInfo } | null
  cleanups: (() => void)[]
  validity: Map<string, { valid: boolean; message?: string }>
  attributed: Map<HTMLElement, string | null>
  pressed: Map<HTMLElement, string | null>
  keyboardFocus: HTMLElement | null
  scrollFrame: number | null
  ignoreNextClick: boolean
}

function endpointId(endpoint: ConnectionEndpoint): string {
  return `${endpoint.blockId}:${endpoint.portId ?? ''}`
}

function describe(endpoint: ConnectionEndpoint | undefined): string {
  if (!endpoint) return ''
  return endpoint.portId ? `${endpoint.blockId} / ${endpoint.portId}` : endpoint.blockId
}

function clean(endpoint: ConnectionEndpoint): ConnectionEndpoint {
  return endpoint.portId === undefined
    ? { blockId: endpoint.blockId }
    : { blockId: endpoint.blockId, portId: endpoint.portId }
}

const DEFAULT_MESSAGES = {
  start: (c: ConnectMessageContext) => `Connecting from ${describe(c.from)}. Choose a target.`,
  candidate: (c: ConnectMessageContext) => `${describe(c.to)} can be connected.`,
  complete: (c: ConnectMessageContext) => `Connection requested from ${describe(c.from)} to ${describe(c.to)}.`,
  cancel: () => 'Connection cancelled.',
  invalid: (c: ConnectMessageContext) =>
    c.message ? `Cannot connect to ${describe(c.to)}: ${c.message}` : `Cannot connect to ${describe(c.to)}.`,
}

function renderMessage(
  message: ConnectMessage | undefined,
  fallback: (c: ConnectMessageContext) => string,
  c: ConnectMessageContext,
) {
  if (typeof message === 'function') return message(c)
  if (typeof message === 'string') {
    return message
      .replace(/\{from\}/g, describe(c.from))
      .replace(/\{to\}/g, describe(c.to))
      .replace(/\{message\}/g, c.message ?? '')
  }
  return fallback(c)
}

function modifiersOf(event?: { shiftKey?: boolean; ctrlKey?: boolean; altKey?: boolean; metaKey?: boolean }) {
  return {
    shift: Boolean(event?.shiftKey),
    ctrl: Boolean(event?.ctrlKey),
    alt: Boolean(event?.altKey),
    meta: Boolean(event?.metaKey),
  }
}

export function createConnectController(host: ConnectHost) {
  let session: Session | null = null
  let listenersOn = false
  let lastModifiers = modifiersOf()
  let swallowClickUntil = 0

  const cfg = () => host.config()
  const enabled = () => Boolean(cfg()?.enabled)
  const mode = () => cfg()?.mode ?? 'both'
  const originFrom = () => cfg()?.from ?? 'port'
  const originTo = () => cfg()?.to ?? 'port'
  const snap = () => cfg()?.snap ?? DEFAULT_SNAP

  function kindAllowed(origin: 'port' | 'block' | 'both', endpoint: ConnectionEndpoint): boolean {
    if (origin === 'both') return true
    return endpoint.portId !== undefined ? origin === 'port' : origin === 'block'
  }

  function roleOfEndpoint(endpoint: ConnectionEndpoint): Exclude<ConnectRole, false> | false {
    if (!host.hasBlock(endpoint.blockId)) return false
    if (endpoint.portId !== undefined) {
      if (!host.hasPort(endpoint.blockId, endpoint.portId)) return false
      return host.portRole(endpoint.blockId, endpoint.portId)
    }
    return host.blockRole(endpoint.blockId)
  }

  function canStart(endpoint: ConnectionEndpoint): boolean {
    if (!enabled() || !kindAllowed(originFrom(), endpoint)) return false
    const role = roleOfEndpoint(endpoint)
    return role === 'source' || role === 'both'
  }

  function duplicate(from: ConnectionEndpoint, to: ConnectionEndpoint): boolean {
    for (const connection of host.connections()) {
      if (
        connection.from.blockId === from.blockId &&
        (connection.from.portId ?? '') === (from.portId ?? '') &&
        connection.to.blockId === to.blockId &&
        (connection.to.portId ?? '') === (to.portId ?? '')
      ) {
        return true
      }
    }
    return false
  }

  function check(from: ConnectionEndpoint, to: ConnectionEndpoint): { valid: boolean; message?: string } {
    if (!enabled() || !kindAllowed(originTo(), to)) return { valid: false }
    const role = roleOfEndpoint(to)
    if (role !== 'target' && role !== 'both') return { valid: false }
    if (!cfg()?.allowSelf && from.blockId === to.blockId) return { valid: false }
    if (!cfg()?.allowDuplicates && duplicate(from, to)) return { valid: false }
    const validate = cfg()?.validate
    if (validate) {
      const result = validate(clean(from), clean(to))
      if (result === false) return { valid: false }
      if (typeof result === 'string') return { valid: false, message: result }
    }
    return { valid: true }
  }

  function memoCheck(s: Session, to: ConnectionEndpoint) {
    const key = endpointId(to)
    let result = s.validity.get(key)
    if (!result) {
      result = check(s.from, to)
      s.validity.set(key, result)
    }
    return result
  }

  function say(kind: 'start' | 'candidate' | 'complete' | 'cancel' | 'invalid', context: ConnectMessageContext) {
    const announce = cfg()?.announce
    host.announce(renderMessage(announce?.[kind], DEFAULT_MESSAGES[kind], context))
  }

  function setAttribute(s: Session, el: HTMLElement, value: string | null) {
    if (!s.attributed.has(el)) s.attributed.set(el, el.getAttribute('data-vl-connect-state'))
    if (value === null) el.removeAttribute('data-vl-connect-state')
    else el.setAttribute('data-vl-connect-state', value)
  }

  function elementOf(endpoint: ConnectionEndpoint): HTMLElement | undefined {
    return endpoint.portId !== undefined
      ? host.portElement(endpoint.blockId, endpoint.portId)
      : host.blockElement(endpoint.blockId)
  }

  function paintStates(s: Session) {
    const states = new Map<string, ConnectPortState>()
    const stateOfElement = new Map<HTMLElement, ConnectPortState>()
    const fromId = endpointId(s.from)
    for (const handle of host.handles()) {
      const id = endpointId(handle.endpoint)
      let state: ConnectPortState | null = null
      if (id === fromId) state = 'source'
      else if (memoCheck(s, handle.endpoint).valid) state = 'candidate'
      if (s.candidate?.handle?.key === handle.key) {
        state = s.candidate.valid ? 'target' : 'invalid'
      }
      if (state) {
        if (!handle.hidden) states.set(handle.key, state)
        stateOfElement.set(handle.el, state)
      }
    }
    const sourceEl = elementOf(s.from)
    if (sourceEl) stateOfElement.set(sourceEl, 'source')
    if (s.candidate && !s.candidate.handle) {
      const el = elementOf(s.candidate.endpoint)
      if (el) stateOfElement.set(el, s.candidate.valid ? 'target' : 'invalid')
    }
    const rank: Record<ConnectPortState, number> = { source: 4, target: 3, invalid: 2, candidate: 1 }
    const blockState = new Map<HTMLElement, ConnectPortState>()
    const blockOf = (endpoint: ConnectionEndpoint) => host.blockElement(endpoint.blockId)
    const raise = (el: HTMLElement | undefined, state: ConnectPortState) => {
      if (!el) return
      const current = blockState.get(el)
      if (!current || rank[state] > rank[current]) blockState.set(el, state)
    }
    for (const handle of host.handles()) {
      const state = stateOfElement.get(handle.el)
      if (state) raise(blockOf(handle.endpoint), state)
    }
    raise(blockOf(s.from), 'source')
    if (s.candidate) raise(blockOf(s.candidate.endpoint), s.candidate.valid ? 'target' : 'invalid')
    for (const [el, state] of blockState) {
      const own = stateOfElement.get(el)
      if (!own || rank[state] > rank[own]) stateOfElement.set(el, state)
    }
    for (const el of [...s.attributed.keys()]) {
      if (!stateOfElement.has(el)) setAttribute(s, el, null)
    }
    for (const [el, state] of stateOfElement) setAttribute(s, el, state)
    if (sourceEl && !s.pressed.has(sourceEl)) {
      s.pressed.set(sourceEl, sourceEl.getAttribute('aria-pressed'))
      sourceEl.setAttribute('aria-pressed', 'true')
    }
    host.setStates(states)
  }

  function nearestHandle(s: Session): { handle: HandleInfo; distance: number } | null {
    let best: { handle: HandleInfo; distance: number } | null = null
    const limit = Math.max(snap(), 0)
    for (const handle of host.handles()) {
      if (handle.hidden) continue
      if (endpointId(handle.endpoint) === endpointId(s.from)) continue
      const role = handle.role
      if (role !== 'target' && role !== 'both') continue
      if (!kindAllowed(originTo(), handle.endpoint)) continue
      const distance = Math.hypot(handle.point.x - s.cursor.x, handle.point.y - s.cursor.y)
      const reach = Math.max(limit, HANDLE_MIN_RADIUS)
      if (distance > reach) continue
      if (!best || distance < best.distance) best = { handle, distance }
    }
    return best
  }

  function updateCandidate(s: Session, clientX: number, clientY: number) {
    const previous = s.candidate
    const near = nearestHandle(s)
    let next: Session['candidate'] = null
    if (near) {
      const endpoint = clean(near.handle.endpoint)
      const result = memoCheck(s, endpoint)
      next = { endpoint, valid: result.valid, message: result.message, handle: near.handle }
    } else if (originTo() !== 'port') {
      const blockId = host.blockAt(clientX, clientY)
      if (blockId) {
        const endpoint = { blockId }
        const result = memoCheck(s, endpoint)
        next = { endpoint, valid: result.valid, message: result.message }
      }
    }
    s.candidate = next
    const changed = endpointOrNull(previous) !== endpointOrNull(next) || previous?.valid !== next?.valid
    if (changed) {
      paintStates(s)
      host.emit('connect:candidate', {
        from: clean(s.from),
        candidate: next ? clean(next.endpoint) : null,
        valid: next ? next.valid : false,
      })
      if (next) {
        if (next.valid) say('candidate', { from: s.from, to: next.endpoint })
        else say('invalid', { from: s.from, to: next.endpoint, message: next.message })
      }
    }
  }

  function endpointOrNull(candidate: Session['candidate']): string | null {
    return candidate ? endpointId(candidate.endpoint) : null
  }

  function drawPreview(s: Session) {
    const startHandle = host.handles().find((handle) => endpointId(handle.endpoint) === endpointId(s.from))
    const toward = s.candidate?.handle ? s.candidate.handle.point : s.cursor
    const origin: BlockGeometry | null =
      startHandle && s.from.portId !== undefined
        ? { point: startHandle.point, side: startHandle.side }
        : host.blockGeometry(s.from.blockId, toward)
    if (!origin) {
      host.setPreview(null, null)
      return
    }
    const target = s.candidate?.handle
    const d = host.previewPath(origin, toward, target ? target.side : null)
    host.setPreview(d, s.candidate ? (s.candidate.valid ? 'valid' : 'invalid') : null)
    host.stylePreview()
  }

  function pointInfo(clientX: number, clientY: number, s: Session) {
    s.cursor = host.toLocal(clientX, clientY)
    updateCandidate(s, clientX, clientY)
    drawPreview(s)
  }

  function stopAutoScroll(s: Session) {
    if (s.scrollFrame !== null) {
      cancelAnimationFrame(s.scrollFrame)
      s.scrollFrame = null
    }
  }

  function scrollableAncestor(el: Element | null, container: HTMLElement): HTMLElement | null {
    for (let node = el; node && node !== document.documentElement; node = node.parentElement) {
      if (!(node instanceof HTMLElement)) continue
      const style = getComputedStyle(node)
      if (/(auto|scroll)/.test(style.overflowY) && node.scrollHeight > node.clientHeight) return node
      if (node === container) break
    }
    return null
  }

  function autoScroll(s: Session, clientX: number, clientY: number) {
    if (!cfg()?.autoScroll || typeof document.elementFromPoint !== 'function') return
    stopAutoScroll(s)
    const el = document.elementFromPoint(clientX, clientY)
    const scroller = scrollableAncestor(el, host.container)
    if (!scroller) return
    const rect = scroller.getBoundingClientRect()
    let delta = 0
    if (clientY < rect.top + AUTO_SCROLL_EDGE) delta = -AUTO_SCROLL_STEP
    else if (clientY > rect.bottom - AUTO_SCROLL_EDGE) delta = AUTO_SCROLL_STEP
    if (delta === 0) return
    const tick = () => {
      if (!session || session !== s) return
      scroller.scrollTop += delta
      pointInfo(clientX, clientY, s)
      s.scrollFrame = requestAnimationFrame(tick)
    }
    s.scrollFrame = requestAnimationFrame(tick)
  }

  function finish(s: Session) {
    stopAutoScroll(s)
    if (s.pointerId !== undefined) {
      swallowClickUntil = performance.now() + 400
      try {
        s.captureEl?.releasePointerCapture?.(s.pointerId)
      } catch {
        s.captureEl = undefined
      }
    }
    for (const cleanup of s.cleanups) cleanup()
    s.cleanups = []
    for (const [el, original] of s.attributed) {
      if (original === null) el.removeAttribute('data-vl-connect-state')
      else el.setAttribute('data-vl-connect-state', original)
    }
    s.attributed.clear()
    for (const [el, original] of s.pressed) {
      if (original === null) el.removeAttribute('aria-pressed')
      else el.setAttribute('aria-pressed', original)
    }
    s.pressed.clear()
    host.setDim(null)
    host.container.removeAttribute('data-vl-connecting')
    host.setStates(new Map())
    host.setPreview(null, null)
    if (session === s) session = null
    host.onStateChange(false)
  }

  function cancelSession(reason: ConnectCancelReason, message?: string) {
    const s = session
    if (!s) return
    const from = clean(s.from)
    finish(s)
    if (reason !== 'invalid') say('cancel', { from })
    host.emit('connection:create-cancel', {
      from,
      reason,
      ...(message !== undefined ? { message } : {}),
    })
  }

  function completeSession(to: ConnectionEndpoint, via: ConnectVia, event?: Parameters<typeof modifiersOf>[0]) {
    const s = session
    if (!s) return false
    const result = memoCheck(s, to)
    if (!result.valid) {
      say('invalid', { from: s.from, to, message: result.message })
      return false
    }
    const from = clean(s.from)
    const target = clean(to)
    finish(s)
    say('complete', { from, to: target })
    host.emit('connection:create-request', {
      from,
      to: target,
      via,
      modifiers: event ? modifiersOf(event) : lastModifiers,
    })
    return true
  }

  function onKeyboardFocusMove(s: Session, direction: 1 | -1) {
    const candidates = host
      .handles()
      .filter((handle) => handle.role === 'target' || handle.role === 'both')
      .filter((handle) => endpointId(handle.endpoint) !== endpointId(s.from) || cfg()?.allowSelf)
      .filter((handle) => memoCheck(s, handle.endpoint).valid)
      .sort((a, b) => (a.el.compareDocumentPosition(b.el) & Node.DOCUMENT_POSITION_FOLLOWING ? -1 : 1))
    if (candidates.length === 0) return
    const current = candidates.findIndex((handle) => handle.el === s.keyboardFocus)
    const next =
      current < 0
        ? direction === 1
          ? 0
          : candidates.length - 1
        : (current + direction + candidates.length) % candidates.length
    const handle = candidates[next]!
    s.keyboardFocus = handle.el
    handle.el.focus({ preventScroll: false })
    s.candidate = { endpoint: clean(handle.endpoint), valid: true, handle }
    paintStates(s)
    say('candidate', { from: s.from, to: handle.endpoint })
    s.cursor = handle.point
    drawPreview(s)
  }

  function documentKeydown(event: KeyboardEvent) {
    lastModifiers = modifiersOf(event)
    const s = session
    if (!s) {
      portKeydown(event)
      return
    }
    if (event.key === 'Escape') {
      event.preventDefault()
      event.stopPropagation()
      cancelSession('escape')
      return
    }
    if (s.via !== 'keyboard') return
    if (event.key === 'Tab') {
      event.preventDefault()
      onKeyboardFocusMove(s, event.shiftKey ? -1 : 1)
    } else if (event.key === 'ArrowDown' || event.key === 'ArrowRight') {
      event.preventDefault()
      onKeyboardFocusMove(s, 1)
    } else if (event.key === 'ArrowUp' || event.key === 'ArrowLeft') {
      event.preventDefault()
      onKeyboardFocusMove(s, -1)
    } else if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault()
      const target = s.keyboardFocus
      const handle = host.handles().find((candidate) => candidate.el === target)
      if (!handle) return
      completeSession(clean(handle.endpoint), 'keyboard', event)
    }
  }

  function portKeydown(event: KeyboardEvent) {
    if (session || !enabled()) return
    if (event.key !== 'Enter' && event.key !== ' ') return
    const target = event.target instanceof Element ? event.target : null
    if (!target) return
    const handle = host.handles().find((candidate) => candidate.el === target || candidate.el.contains(target))
    if (!handle || !canStart(handle.endpoint)) return
    event.preventDefault()
    event.stopPropagation()
    begin(handle.endpoint, 'keyboard', { cursor: handle.point })
  }

  function ensureListeners() {
    if (listenersOn) return
    listenersOn = true
    document.addEventListener('keydown', documentKeydown, true)
  }

  function dropListeners() {
    if (!listenersOn) return
    listenersOn = false
    document.removeEventListener('keydown', documentKeydown, true)
  }

  function begin(
    from: ConnectionEndpoint,
    via: ConnectVia | 'api',
    options: { cursor?: Point; pointerId?: number; captureEl?: Element; clientX?: number; clientY?: number } = {},
  ): boolean {
    if (session) cancelSession('api')
    const origin = clean(from)
    const s: Session = {
      from: origin,
      via,
      cursor: options.cursor ?? host.toLocal(options.clientX ?? 0, options.clientY ?? 0),
      pointerId: options.pointerId,
      captureEl: options.captureEl,
      startX: options.clientX ?? 0,
      startY: options.clientY ?? 0,
      moved: false,
      candidate: null,
      cleanups: [],
      validity: new Map(),
      attributed: new Map(),
      pressed: new Map(),
      keyboardFocus: null,
      scrollFrame: null,
      ignoreNextClick: false,
    }
    session = s
    const dim = cfg()?.dimOthers
    host.setDim(dim === true ? 0.35 : typeof dim === 'number' ? dim : null)
    host.container.setAttribute('data-vl-connecting', 'true')
    host.onStateChange(true)
    paintStates(s)
    if (via === 'keyboard') s.keyboardFocus = elementOf(origin) ?? null
    drawPreview(s)
    say('start', { from: origin })
    host.emit('connect:start', { from: origin, via })
    return true
  }

  function trackPointer(s: Session) {
    const onMove = (event: PointerEvent) => {
      if (session !== s) return
      if (s.pointerId !== undefined && event.pointerId !== s.pointerId) return
      lastModifiers = modifiersOf(event)
      if (!s.moved && Math.hypot(event.clientX - s.startX, event.clientY - s.startY) > CLICK_TOLERANCE) s.moved = true
      pointInfo(event.clientX, event.clientY, s)
      if (s.via === 'drag') autoScroll(s, event.clientX, event.clientY)
    }
    document.addEventListener('pointermove', onMove, true)
    s.cleanups.push(() => document.removeEventListener('pointermove', onMove, true))
  }

  function startDrag(from: ConnectionEndpoint, event: PointerEvent, captureEl: Element): boolean {
    if (!enabled() || !canStart(from)) return false
    if (mode() === 'click') return false
    event.preventDefault()
    begin(from, 'drag', {
      pointerId: event.pointerId,
      captureEl,
      clientX: event.clientX,
      clientY: event.clientY,
    })
    const s = session!
    lastModifiers = modifiersOf(event)
    try {
      captureEl.setPointerCapture?.(event.pointerId)
    } catch {
      s.captureEl = undefined
    }
    trackPointer(s)
    pointInfo(event.clientX, event.clientY, s)

    const onUp = (upEvent: PointerEvent) => {
      if (session !== s || upEvent.pointerId !== s.pointerId) return
      swallowClickUntil = performance.now() + 400
      lastModifiers = modifiersOf(upEvent)
      pointInfo(upEvent.clientX, upEvent.clientY, s)
      const modes = mode()
      if (!s.moved) {
        if (modes === 'click' || modes === 'both') {
          s.via = 'click'
          s.pointerId = undefined
          s.ignoreNextClick = true
          stopAutoScroll(s)
          s.cleanups.splice(0).forEach((cleanup) => cleanup())
          trackPointer(s)
          armClick(s)
          return
        }
        cancelSession('no-target')
        return
      }
      const candidate = s.candidate
      if (candidate?.valid) {
        completeSession(candidate.endpoint, 'drag', upEvent)
      } else if (candidate) {
        say('invalid', { from: s.from, to: candidate.endpoint, message: candidate.message })
        cancelSession('invalid', candidate.message)
      } else {
        cancelSession('no-target')
      }
    }
    const onCancel = (cancelEvent: PointerEvent) => {
      if (session !== s || cancelEvent.pointerId !== s.pointerId) return
      cancelSession('pointer-cancel')
    }
    document.addEventListener('pointerup', onUp, true)
    document.addEventListener('pointercancel', onCancel, true)
    s.cleanups.push(() => {
      document.removeEventListener('pointerup', onUp, true)
      document.removeEventListener('pointercancel', onCancel, true)
    })
    return true
  }

  function armClick(s: Session) {
    const onClick = (event: MouseEvent) => {
      if (session !== s) return
      if (s.ignoreNextClick) {
        s.ignoreNextClick = false
        return
      }
      lastModifiers = modifiersOf(event)
      const target = event.target instanceof Element ? event.target : null
      if (target && !target.closest('[data-vl-handle]') && host.ignored(target)) return
      const group = target?.closest('[data-vl-handle]')
      const key = group?.getAttribute('data-vl-handle')
      const handle = key ? host.handles().find((candidate) => candidate.key === key) : undefined
      s.cursor = host.toLocal(event.clientX, event.clientY)
      if (handle) {
        event.preventDefault()
        event.stopPropagation()
        const endpoint = clean(handle.endpoint)
        const result = memoCheck(s, endpoint)
        if (result.valid) completeSession(endpoint, 'click', event)
        else {
          say('invalid', { from: s.from, to: endpoint, message: result.message })
          cancelSession('invalid', result.message)
        }
        return
      }
      updateCandidate(s, event.clientX, event.clientY)
      if (s.candidate && !s.candidate.handle) {
        event.preventDefault()
        event.stopPropagation()
        if (s.candidate.valid) completeSession(s.candidate.endpoint, 'click', event)
        else cancelSession('invalid', s.candidate.message)
        return
      }
      cancelSession('no-target')
    }
    document.addEventListener('click', onClick, true)
    s.cleanups.push(() => document.removeEventListener('click', onClick, true))
  }

  function startFromBlock(blockId: string, event: PointerEvent, draggable: boolean): boolean {
    const endpoint = { blockId }
    if (!enabled() || originFrom() === 'port' || draggable || mode() === 'click' || session) return false
    if (event.pointerType === 'mouse' && event.button !== 0) return false
    if (!canStart(endpoint)) return false
    return startDrag(endpoint, event, event.currentTarget as Element)
  }

  function clickBlock(blockId: string, event: MouseEvent): boolean {
    if (performance.now() < swallowClickUntil) return false
    const endpoint = { blockId }
    if (!enabled() || originFrom() === 'port') return false
    const modes = mode()
    if (modes === 'drag') return false
    if (session) return false
    if (!canStart(endpoint)) return false
    begin(endpoint, 'click', { clientX: event.clientX, clientY: event.clientY })
    const s = session!
    lastModifiers = modifiersOf(event)
    trackPointer(s)
    armClick(s)
    return true
  }

  function handleClick(handle: HandleInfo, event: MouseEvent): boolean {
    if (session || !enabled()) return false
    if (performance.now() < swallowClickUntil) return false
    const modes = mode()
    if (modes === 'drag') return false
    if (!canStart(handle.endpoint)) return false
    lastModifiers = modifiersOf(event)
    begin(handle.endpoint, 'click', { clientX: event.clientX, clientY: event.clientY })
    const s = session!
    trackPointer(s)
    armClick(s)
    return true
  }

  function handlePointerDown(handle: HandleInfo, event: PointerEvent): boolean {
    if (!enabled()) return false
    if (event.pointerType === 'mouse' && event.button !== 0) return false
    if (session) return false
    if (!canStart(handle.endpoint)) return false
    const modes = mode()
    if (modes === 'click') {
      event.preventDefault()
      return false
    }
    return startDrag(handle.endpoint, event, event.currentTarget as Element)
  }

  return {
    handlePointerDown,
    handleClick,
    startFromBlock,
    clickBlock,
    syncListeners() {
      if (enabled()) ensureListeners()
      else {
        if (session) cancelSession('api')
        dropListeners()
      }
    },
    start(from: ConnectionEndpoint): boolean {
      if (!enabled() || !canStart(from)) return false
      begin(from, 'api')
      const s = session!
      trackPointer(s)
      return true
    },
    complete(to: ConnectionEndpoint): boolean {
      if (!enabled() || !session) return false
      if (!completeSession(to, 'click')) return false
      return true
    },
    cancel(reason: ConnectCancelReason = 'api') {
      cancelSession(reason)
    },
    isConnecting(): { active: boolean; from?: ConnectionEndpoint } {
      return session ? { active: true, from: clean(session.from) } : { active: false }
    },
    refresh() {
      if (session) {
        paintStates(session)
        drawPreview(session)
      }
    },
    destroy() {
      if (session) cancelSession('api')
      dropListeners()
    },
  }
}

export type ConnectController = ReturnType<typeof createConnectController>
