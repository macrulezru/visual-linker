import { afterEach, describe, expect, it } from 'vitest'
import { flowStrokeWidth, resolveFlow } from '../src/flow'
import { createVisualLinker, type VisualLinker } from '../src/visual-linker'

describe('resolveFlow', () => {
  it('is off unless enabled; own setting beats the default, and `false` opts out of an inherited one', () => {
    expect(resolveFlow(undefined, undefined)).toBeNull()
    expect(resolveFlow(false, true)).toBeNull()
    expect(resolveFlow(undefined, true)).not.toBeNull()
    expect(resolveFlow({ speed: 100 }, { speed: 10 })!.speed).toBe(100)
  })

  it('fills in dash/dot defaults and clamps nonsense', () => {
    expect(resolveFlow(true, undefined)).toEqual({
      speed: 60,
      direction: 'forward',
      dash: 8,
      gap: 14,
      color: undefined, // tint mode: follows the line
      width: undefined,
      dots: false,
    })
    const dots = resolveFlow({ shape: 'dots' }, undefined)!
    expect(dots.dots).toBe(true)
    expect(dots.dash).toBeLessThan(0.1) // a round cap turns it into a circle
    expect(dots.gap).toBe(12)
    expect(resolveFlow({ speed: -5, gap: 0 }, undefined)).toMatchObject({ speed: 1, gap: 1 })
  })

  it('derives the stroke width from the line unless given: as wide as the line in tint mode, a thinner highlight with an explicit color', () => {
    const tint = resolveFlow(true, undefined)!
    expect(flowStrokeWidth(tint, 4)).toBe(4)
    expect(flowStrokeWidth(resolveFlow({ shape: 'dots' }, undefined)!, 1)).toBe(3) // tint dots keep a visible minimum
    expect(flowStrokeWidth(resolveFlow({ shape: 'dots' }, undefined)!, 4)).toBeCloseTo(6.4)

    const custom = resolveFlow({ color: 'gold' }, undefined)!
    expect(flowStrokeWidth(custom, 4)).toBeCloseTo(2.4)
    expect(flowStrokeWidth(custom, 0.5)).toBe(1) // never thinner than 1px
    expect(flowStrokeWidth(resolveFlow({ color: 'gold', shape: 'dots' }, undefined)!, 1)).toBe(2.5)
    expect(flowStrokeWidth(resolveFlow({ width: 7 }, undefined)!, 1)).toBe(7)
  })
})

describe('flow overlay', () => {
  let engine: VisualLinker | undefined
  afterEach(() => {
    engine?.destroy()
    document.body.innerHTML = ''
  })

  function setup(style: object | undefined, options: Parameters<typeof createVisualLinker>[1] = {}) {
    const container = document.createElement('div')
    document.body.appendChild(container)
    const make = (id: string, left: number) => {
      const el = document.createElement('div')
      el.getBoundingClientRect = () => new DOMRect(left, 0, 100, 40)
      container.appendChild(el)
      return { id, el }
    }
    engine = createVisualLinker(container, { showPorts: false, ...options })
    engine.setBlocks([make('a', 0), make('b', 300)])
    const connection = { id: 'ab', from: { blockId: 'a' }, to: { blockId: 'b' }, style }
    engine.setConnections([connection])
    const overlays = () => [...container.querySelectorAll<SVGPathElement>('path.vl-flow')]
    const line = () => container.querySelector('path.vl-connection') as SVGPathElement
    return {
      container,
      overlays,
      line,
      set: (next: object | undefined) => engine!.setConnections([{ ...connection, style: next }]),
    }
  }

  it('draws nothing by default', () => {
    expect(setup({}).overlays()).toHaveLength(0)
  })

  it('adds an overlay right after its line, mirroring the line geometry, with the pattern, speed and direction', () => {
    const { overlays, line } = setup({ width: 2, animated: { speed: 44, dash: 6, gap: 16, color: 'gold' } })
    // (explicit color → highlight mode, so the width is a fraction of the line's)
    const [flow] = overlays()
    expect(flow).toBeDefined()
    expect(line().nextElementSibling).toBe(flow)
    expect(flow!.getAttribute('d')).toBe(line().getAttribute('d'))
    expect(flow!.style.strokeDasharray).toBe('6 16')
    expect(flow!.style.stroke).toBe('gold')
    expect(flow!.style.getPropertyValue('--vl-flow-period')).toBe('22px')
    expect(flow!.style.animationDuration).toBe('0.5s') // 22px at 44px/s
    expect(flow!.style.animationName).toBe('vl-flow-forward')
    expect(flow!.getAttribute('aria-hidden')).toBe('true')
    expect(Number(flow!.style.strokeWidth)).toBeCloseTo(1.2) // 60% of the line's 2px
  })

  it('tint mode: the pattern wears the line color and the line is dimmed (less so while hovered); an explicit color leaves the line alone', () => {
    const tinted = setup({ color: 'tomato', animated: true })
    expect(tinted.overlays()[0]!.style.stroke).toBe('tomato')
    expect(tinted.overlays()[0]!.classList.contains('vl-flow--tint')).toBe(true)
    expect(Number(tinted.line().style.strokeOpacity)).toBeCloseTo(0.35)
    tinted.container.querySelector('path.vl-connection-hit')!.dispatchEvent(new Event('pointerenter'))
    expect(Number(tinted.line().style.strokeOpacity)).toBeCloseTo(0.7)
    engine!.destroy()

    const custom = setup({ animated: { color: 'gold' } })
    expect(custom.overlays()[0]!.style.stroke).toBe('gold')
    expect(custom.overlays()[0]!.classList.contains('vl-flow--tint')).toBe(false)
    expect(custom.line().style.strokeOpacity).toBe('')
    custom.set({ animated: false })
    expect(custom.line().style.strokeOpacity).toBe('')
  })

  it('runs backwards on request, and follows the line when the style turns it on/off or the path changes', () => {
    const { overlays, set, line } = setup({ animated: true })
    expect(overlays()[0]!.style.animationName).toBe('vl-flow-forward')

    set({ animated: { direction: 'backward' } })
    expect(overlays()).toHaveLength(1) // reused, not duplicated
    expect(overlays()[0]!.style.animationName).toBe('vl-flow-backward')

    set({ animated: false })
    expect(overlays()).toHaveLength(0)

    set({ animated: true })
    expect(overlays()[0]!.getAttribute('d')).toBe(line().getAttribute('d'))
  })

  it('takes defaultAnimated from the options, and `animated: false` opts a connection out', () => {
    expect(setup({}, { defaultAnimated: true }).overlays()).toHaveLength(1)
    engine!.destroy()
    expect(setup({ animated: false }, { defaultAnimated: true }).overlays()).toHaveLength(0)
  })

  it('removes the overlay with its connection', () => {
    const { overlays } = setup({ animated: true })
    engine!.removeConnection('ab')
    expect(overlays()).toHaveLength(0)
  })

  it('stays attached to its line when the line is raised for hover/selection', () => {
    const { overlays, line, container } = setup({ animated: true }, { selectable: true })
    engine!.setSelectedConnections(['ab'])
    expect(line().nextElementSibling).toBe(overlays()[0])
    expect(container.querySelectorAll('path.vl-flow')).toHaveLength(1)
  })
})
