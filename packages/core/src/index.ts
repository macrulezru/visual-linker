export { createVisualLinker } from './visual-linker'
export type { VisualLinker } from './visual-linker'

export { VLConnectionCurveEnum, VLMarkerShapeEnum, VLFixedSideEnum, VLOrientEnum } from './enums'

export { lightTheme, darkTheme, defineTheme } from './theme'
export { mergeConfig, patchConfig, mergeMarkerInputs } from './config'

export type {
  PortSide,
  FixedSide,
  PortDescriptor,
  BlockDescriptor,
  ConnectionCurve,
  ConnectionStyle,
  ConnectionMarkers,
  MarkerShape,
  MarkerStyle,
  MarkerConfig,
  MarkerInput,
  MarkerSizes,
  MarkersConfig,
  MarkerArrowConfig,
  LineStyle,
  LineOptions,
  LinesConfig,
  BezierConfig,
  SmoothstepConfig,
  RoutingConfig,
  PortStyle,
  PortsConfig,
  LabelStyle,
  LabelsConfig,
  BlocksConfig,
  InteractionConfig,
  Theme,
  Stateful,
  VisualState,
  VisualLinkerConfig,
  ConnectionFlow,
  JumpsOption,
  ConnectionLabel,
  LabelLayout,
  ConnectionEndpoint,
  ConnectionDescriptor,
  ConnectionLayout,
  PortLayout,
  VisualLinkerEventMap,
  DragBounds,
  PortSpread,
  PortSpreadOptions,
  DragBoundsInset,
} from './types'

export type { Point } from './geometry'
