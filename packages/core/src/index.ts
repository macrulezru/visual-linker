export { createVisualLinker } from './visual-linker'
export type { VisualLinker } from './visual-linker'

// Values (not just types) — a consumer writing `side: VLFixedSideEnum.LEFT` or
// `curve: VLConnectionCurveEnum.SMOOTHSTEP` needs these actually exported, not
// just their derived string-literal-union types.
export { VLConnectionCurveEnum, VLMarkerShapeEnum, VLFixedSideEnum, VLOrientEnum } from './enums'

export type {
  PortSide,
  FixedSide,
  PortDescriptor,
  BlockDescriptor,
  ConnectionCurve,
  ConnectionStyle,
  MarkerShape,
  MarkerConfig,
  ConnectionEndpoint,
  ConnectionDescriptor,
  VisualLinkerOptions,
  VisualLinkerEventMap,
} from './types'
