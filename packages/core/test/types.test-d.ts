import { expectTypeOf, test } from 'vitest'
import { VLConnectionCurveEnum, VLFixedSideEnum, VLMarkerShapeEnum, VLOrientEnum } from '../src'
import type { ConnectionCurve, FixedSide, MarkerConfig, MarkerShape, PortDescriptor, PortSide } from '../src'

test('curves accept literals and enum members', () => {
  expectTypeOf<'bezier' | 'straight' | 'smoothstep'>().toMatchTypeOf<ConnectionCurve>()
  expectTypeOf<VLConnectionCurveEnum.STRAIGHT>().toMatchTypeOf<ConnectionCurve>()
  expectTypeOf<'wavy'>().not.toMatchTypeOf<ConnectionCurve>()
})

test('marker shapes accept literals and enum members', () => {
  expectTypeOf<'circle' | 'square' | 'diamond' | 'arrow'>().toMatchTypeOf<MarkerShape>()
  expectTypeOf<VLMarkerShapeEnum.ARROW>().toMatchTypeOf<MarkerShape>()
  expectTypeOf<'star'>().not.toMatchTypeOf<MarkerShape>()
})

test('sides accept literals and enum members', () => {
  expectTypeOf<'top' | 'right' | 'bottom' | 'left'>().toMatchTypeOf<FixedSide>()
  expectTypeOf<VLFixedSideEnum.LEFT>().toMatchTypeOf<FixedSide>()
  expectTypeOf<'auto'>().toMatchTypeOf<PortSide>()
  expectTypeOf<'auto'>().not.toMatchTypeOf<FixedSide>()
  expectTypeOf<{ id: string; side: ['left', 'right'] }>().toMatchTypeOf<PortDescriptor>()
})

test('marker orient accepts literals and enum members', () => {
  expectTypeOf<{ orient: 'fixed' }>().toMatchTypeOf<MarkerConfig>()
  expectTypeOf<{ orient: VLOrientEnum.AUTO }>().toMatchTypeOf<MarkerConfig>()
})
