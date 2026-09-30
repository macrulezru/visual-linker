import { defineComponent, h, withDirectives } from 'vue'
import { flushPromises, mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'
import { VisualLinker } from '../src/VisualLinker'
import { vVlBlock } from '../src/directives'

/** A layout component with its own nested wrappers — blocks passed through its slot end up several levels deep. */
const Panel = defineComponent({
  setup(_, { slots }) {
    return () => h('section', { class: 'panel' }, h('div', { class: 'panel-body' }, slots.default?.()))
  },
})

describe('VisualLinker', () => {
  it('renders the default slot untouched (no per-block wrappers) and connects blocks nested inside other components', async () => {
    const wrapper = mount(VisualLinker, {
      props: { connections: [{ id: 'a-b', from: { blockId: 'a' }, to: { blockId: 'b' } }] },
      slots: {
        default: () =>
          h(Panel, () => [
            withDirectives(h('div', { class: 'card-a' }, 'Block A'), [[vVlBlock, 'a']]),
            h(Panel, () => h('div', { class: 'card-b', 'data-vl-block': 'b' }, 'Block B')),
          ]),
      },
      attachTo: document.body,
    })
    await flushPromises()

    expect(wrapper.find('.vl-block').exists()).toBe(false)
    expect(wrapper.find('.panel .panel-body .card-a').attributes('data-vl-block')).toBe('a')
    expect(wrapper.find('.vl-layer svg.vl-svg').exists()).toBe(true)
    // A real engine only draws a path once both endpoints resolve to registered blocks.
    expect(wrapper.findAll('path.vl-connection')).toHaveLength(1)

    wrapper.unmount()
  })

  it('forwards drag lifecycle events for a block marked draggable via a data attribute', async () => {
    const wrapper = mount(VisualLinker, {
      props: { connections: [] },
      slots: { default: () => h('div', { 'data-vl-block': 'a', 'data-vl-draggable': '' }, 'Block A') },
      attachTo: document.body,
    })
    await flushPromises()

    const block = wrapper.find('[data-vl-block="a"]').element as HTMLElement
    block.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, pointerId: 1, clientX: 0, clientY: 0 }))
    block.dispatchEvent(new PointerEvent('pointermove', { bubbles: true, pointerId: 1, clientX: 15, clientY: 5 }))
    block.dispatchEvent(new PointerEvent('pointerup', { bubbles: true, pointerId: 1, clientX: 15, clientY: 5 }))

    expect(wrapper.emitted('block-dragstart')).toEqual([[{ blockId: 'a' }]])
    expect(wrapper.emitted('block-drag')).toEqual([[{ blockId: 'a', x: 15, y: 5 }]])
    expect(wrapper.emitted('block-dragend')).toEqual([[{ blockId: 'a', x: 15, y: 5 }]])
    expect(block.style.translate).toBe('15px 5px')

    wrapper.unmount()
  })
})
