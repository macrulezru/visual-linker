import { VLConnectionCurveEnum, VLMarkerShapeEnum, VLFixedSideEnum, VLOrientEnum } from './enums'
import type { Point } from './geometry'

export type FixedSide = `${VLFixedSideEnum.TOP | VLFixedSideEnum.RIGHT | VLFixedSideEnum.BOTTOM | VLFixedSideEnum.LEFT}`
export type PortSide = FixedSide | `${VLFixedSideEnum.AUTO}`

export interface PortDescriptor {
  id: string
  target?: string | HTMLElement
  side?: PortSide | FixedSide[]
  offset?: number
  anchorBlockId?: string
  anchorEl?: HTMLElement
  spread?: PortSpread
}

export interface PortSpreadOptions {
  gap?: number
  padding?: number
}

export type PortSpread = boolean | PortSpreadOptions

export interface DragBoundsInset {
  top?: number
  right?: number
  bottom?: number
  left?: number
}

export type DragBounds = 'container' | HTMLElement | DragBoundsInset

export interface BlockDescriptor {
  id: string
  el: HTMLElement
  ports?: PortDescriptor[]
  draggable?: boolean
  dragHandle?: string | HTMLElement
  dragBounds?: DragBounds
  portSpread?: PortSpread
}

export type ConnectionCurve =
  `${VLConnectionCurveEnum.BEZIER | VLConnectionCurveEnum.STRAIGHT | VLConnectionCurveEnum.SMOOTHSTEP}`

export type MarkerShape =
  `${VLMarkerShapeEnum.CIRCLE | VLMarkerShapeEnum.SQUARE | VLMarkerShapeEnum.DIAMOND | VLMarkerShapeEnum.ARROW}`

export type VisualState = 'highlight' | 'hover' | 'selected' | 'focus'

export type Stateful<T> = T & {
  highlight?: Partial<T>
  hover?: Partial<T>
  selected?: Partial<T>
  focus?: Partial<T>
}

export interface MarkerArrowConfig {
  color?: string
  gap?: number
}

export interface MarkerStyle {
  shape?: MarkerShape
  size?: number
  color?: string
  strokeColor?: string
  strokeWidth?: number
  opacity?: number
  className?: string
  svg?: string
  orient?: `${VLOrientEnum.AUTO | VLOrientEnum.FIXED}`
  arrow?: boolean | MarkerArrowConfig
}

export type MarkerConfig = Stateful<MarkerStyle>

export type MarkerInput = false | MarkerShape | MarkerConfig

export interface MarkerSizes {
  circle?: number
  square?: number
  diamond?: number
  arrow?: number
}

export interface MarkersConfig {
  start?: MarkerInput
  end?: MarkerInput
  sizes?: MarkerSizes
}

export interface LineStyle {
  color?: string
  width?: number
  dashed?: boolean
  opacity?: number
}

export interface ConnectionFlow {
  speed?: number
  direction?: 'forward' | 'backward'
  shape?: 'dashes' | 'dots'
  dash?: number
  gap?: number
  color?: string
  width?: number
}

export type JumpsOption = boolean | { radius?: number }

export interface BezierConfig {
  curvature?: number
  minReach?: number
  maxReach?: number
  angleBlend?: number
  angleMaxOffset?: number
}

export interface SmoothstepConfig {
  cornerRadius?: number
  maxTrunkReach?: number
}

export interface RoutingConfig {
  avoidObstacles?: boolean
  padding?: number
}

export interface LineOptions {
  curve?: ConnectionCurve
  animated?: boolean | ConnectionFlow
  bezier?: BezierConfig
  smoothstep?: SmoothstepConfig
  routing?: RoutingConfig
  jumps?: JumpsOption
}

export type LinesConfig = Stateful<LineStyle> & LineOptions

export interface ConnectionMarkers {
  start?: MarkerInput
  end?: MarkerInput
}

export type ConnectionStyle = LinesConfig & {
  markers?: ConnectionMarkers
}

export interface PortStyle {
  radius?: number
  fill?: string
  stroke?: string
  strokeWidth?: number
  opacity?: number
}

export type PortsConfig = Stateful<PortStyle> & {
  show?: boolean
  side?: PortSide | FixedSide[]
  offset?: number
  spread?: PortSpread
}

export interface LabelStyle {
  background?: string
  border?: string
  color?: string
  fontSize?: number
  paddingX?: number
  paddingY?: number
  opacity?: number
}

export type LabelsConfig = Stateful<LabelStyle>

export interface BlocksConfig {
  draggable?: boolean
  drag?: {
    grid?: number
    bounds?: DragBounds
  }
}

export interface InteractionConfig {
  selectable?: boolean
  clipToScrollParents?: boolean | 'pin' | 'hide'
}

export interface Theme {
  line?: string
  lineHover?: string
  lineSelected?: string
  selectedHalo?: string
  focusRing?: string
  portFill?: string
  portStroke?: string
  labelBackground?: string
  labelBorder?: string
  labelText?: string
}

export interface VisualLinkerConfig {
  theme?: Theme
  lines?: LinesConfig
  markers?: MarkersConfig
  ports?: PortsConfig
  labels?: LabelsConfig
  blocks?: BlocksConfig
  interaction?: InteractionConfig
}

export interface ConnectionEndpoint {
  blockId: string
  portId?: string
}

export interface ConnectionLabel {
  id: string
  position: 'start' | 'middle' | 'end' | number
  offset?: number
  text?: string
  className?: string
  rotate?: boolean
}

export interface LabelLayout {
  id: string
  point: Point
  angle: number
  rotation: number
  text?: string
  className?: string
}

export interface ConnectionDescriptor {
  id: string
  from: ConnectionEndpoint
  to: ConnectionEndpoint
  style?: ConnectionStyle
  ariaLabel?: string
  labels?: ConnectionLabel[]
}

export interface ConnectionLayout {
  id: string
  from: Point
  to: Point
  mid: Point
  fromAngle: number
  toAngle: number
  labels: LabelLayout[]
  fromClipped?: boolean
  toClipped?: boolean
}

export interface PortLayout {
  key: string
  blockId: string
  portId?: string
  point: Point
}

export interface VisualLinkerEventMap {
  'block:dragstart': { blockId: string }
  'block:drag': { blockId: string; x: number; y: number }
  'block:dragend': { blockId: string; x: number; y: number }
  'block:mouseenter': { blockId: string }
  'block:mouseleave': { blockId: string }
  'connection:click': { connection: ConnectionDescriptor }
  'connection:mouseenter': { connection: ConnectionDescriptor }
  'connection:mouseleave': { connection: ConnectionDescriptor }
  'connection:selectionchange': { selectedIds: string[] }
  'connection:delete-request': { connections: ConnectionDescriptor[] }
  layout: { connections: ConnectionLayout[]; ports: PortLayout[] }
}
