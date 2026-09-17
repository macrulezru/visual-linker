import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'
import { VisualLinker } from '../src/VisualLinker'

describe('VisualLinker', () => {
  it('renders one wrapper per block and draws its own SVG overlay', async () => {
    const wrapper = mount(VisualLinker, {
      props: {
        blocks: [{ id: 'a' }, { id: 'b' }],
        connections: [{ id: 'a-b', from: { blockId: 'a' }, to: { blockId: 'b' } }],
      },
      slots: {
        'block-a': () => 'Block A',
        'block-b': () => 'Block B',
      },
      attachTo: document.body,
    })

    await wrapper.vm.$nextTick()

    expect(wrapper.findAll('.vl-block')).toHaveLength(2)
    expect(wrapper.find('.vl-container').text()).toContain('Block A')
    expect(wrapper.find('.vl-container').text()).toContain('Block B')
    expect(wrapper.find('svg.vl-svg').exists()).toBe(true)

    wrapper.unmount()
  })

  it('forwards drag lifecycle events for a draggable block', async () => {
    const wrapper = mount(VisualLinker, {
      props: {
        blocks: [{ id: 'a', draggable: true }],
        connections: [],
      },
      slots: {
        'block-a': () => 'Block A',
      },
      attachTo: document.body,
    })

    await wrapper.vm.$nextTick()

    const block = wrapper.find('.vl-block').element as HTMLElement
    block.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, pointerId: 1, clientX: 0, clientY: 0 }))
    block.dispatchEvent(new PointerEvent('pointermove', { bubbles: true, pointerId: 1, clientX: 15, clientY: 5 }))
    block.dispatchEvent(new PointerEvent('pointerup', { bubbles: true, pointerId: 1, clientX: 15, clientY: 5 }))

    expect(wrapper.emitted('block-dragstart')).toEqual([[{ blockId: 'a' }]])
    expect(wrapper.emitted('block-drag')).toEqual([[{ blockId: 'a', x: 15, y: 5 }]])
    expect(wrapper.emitted('block-dragend')).toEqual([[{ blockId: 'a', x: 15, y: 5 }]])

    wrapper.unmount()
  })
})
