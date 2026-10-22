import { VLConnectionCurveEnum, VLMarkerShapeEnum, VLFixedSideEnum, VLOrientEnum } from './enums'
import type { Point } from './geometry'

export type FixedSide = `${VLFixedSideEnum.TOP | VLFixedSideEnum.RIGHT | VLFixedSideEnum.BOTTOM | VLFixedSideEnum.LEFT}`
export type PortSide = FixedSide | `${VLFixedSideEnum.AUTO}`

export type ConnectRole = 'source' | 'target' | 'both' | false

export interface PortDescriptor {
  id: string
  connect?: ConnectRole
  ariaLabel?: string
  style?: PortStyle
  className?: string
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
  connect?: ConnectRole
  ports?: PortDescriptor[]
  draggable?: boolean
  dragHandle?: string | HTMLElement
  dragBounds?: DragBounds
  portSpread?: PortSpread
  highlightable?: boolean
}

export type ConnectionCurve =
  `${VLConnectionCurveEnum.BEZIER | VLConnectionCurveEnum.STRAIGHT | VLConnectionCurveEnum.SMOOTHSTEP}`

export type MarkerShape =
  `${VLMarkerShapeEnum.CIRCLE | VLMarkerShapeEnum.SQUARE | VLMarkerShapeEnum.DIAMOND | VLMarkerShapeEnum.ARROW}`

export type VisualState = 'proxied' | 'highlight' | 'hover' | 'selected' | 'focus'

export type Stateful<T> = T & {
  proxied?: Partial<T>
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
  units?: 'stroke' | 'px'
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

export interface LineEndGap {
  start?: number
  end?: number
}

export interface ProxiedEnds {
  start?: MarkerInput
  end?: MarkerInput
}

export interface LineOptions {
  curve?: ConnectionCurve
  endGap?: number | LineEndGap
  overlap?: 'stack' | 'offset'
  animated?: boolean | ConnectionFlow
  bezier?: BezierConfig
  smoothstep?: SmoothstepConfig
  routing?: RoutingConfig
  jumps?: JumpsOption
}

export type LinesConfig = Omit<Stateful<LineStyle>, 'proxied'> & {
  proxied?: Partial<LineStyle> & ProxiedEnds
  kinds?: Record<string, ConnectionStyle>
} & LineOptions

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

export type ConnectPortState = 'source' | 'candidate' | 'invalid' | 'target'

export type ConnectPortStates = { [K in ConnectPortState]?: PortStyle }

export type PortRole = 'source' | 'target'

export type PortsConfig = Stateful<PortStyle> & {
  connect?: ConnectPortStates
  source?: Stateful<PortStyle>
  target?: Stateful<PortStyle>
  connected?: PortStyle
  show?: boolean | 'connected' | 'all'
  render?: 'svg' | 'dom'
  clearance?: number | 'auto'
  fadeEdge?: number
  slotPointerEvents?: boolean
  sync?: 'marker'
  sides?: { source?: PortSide | FixedSide[]; target?: PortSide | FixedSide[] }
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

export type ConnectMode = 'drag' | 'click' | 'both'
export type ConnectOrigin = 'port' | 'block' | 'both'
export type ConnectHandleVisibility = 'hover' | 'always' | 'never'
export type ConnectVia = 'drag' | 'click' | 'keyboard'
export type ConnectPortRole = 'source' | 'target' | 'both'
export type ConnectCancelReason = 'escape' | 'no-target' | 'invalid' | 'pointer-cancel' | 'api'

export interface ConnectMessageContext {
  from?: ConnectionEndpoint
  to?: ConnectionEndpoint
  message?: string
}

export type ConnectMessage = string | ((context: ConnectMessageContext) => string)

export interface ConnectMessages {
  start?: ConnectMessage
  candidate?: ConnectMessage
  complete?: ConnectMessage
  cancel?: ConnectMessage
  invalid?: ConnectMessage
}

export interface ConnectConfig {
  enabled?: boolean
  mode?: ConnectMode
  from?: ConnectOrigin
  to?: ConnectOrigin
  handle?: ConnectHandleVisibility
  snap?: number
  allowSelf?: boolean
  allowDuplicates?: boolean
  autoScroll?: boolean
  ignore?: string | false
  dimOthers?: boolean | number
  preview?: Stateful<LineStyle> & LineOptions
  announce?: ConnectMessages
  validate?: (from: ConnectionEndpoint, to: ConnectionEndpoint) => boolean | string
}

export interface InteractionConfig {
  hover?: boolean
  highlight?: boolean
  selectable?: boolean
  clipToScrollParents?: boolean | 'pin' | 'hide'
  connect?: ConnectConfig
}

export interface PerformanceConfig {
  cull?: boolean | { margin?: number }
  maxConnectionsForJumps?: number
  maxRoutingNodes?: number
  maxObstacleBlocks?: number
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
  connectPreview?: string
  connectValid?: string
  connectInvalid?: string
}

export interface VisualLinkerConfig {
  theme?: Theme
  lines?: LinesConfig
  markers?: MarkersConfig
  ports?: PortsConfig
  labels?: LabelsConfig
  blocks?: BlocksConfig
  interaction?: InteractionConfig
  performance?: PerformanceConfig
}

export interface ConnectionEndpointRef {
  blockId: string
  portId?: string
}

export interface ConnectionEndpoint {
  blockId: string
  portId?: string
  fallback?: Array<string | ConnectionEndpointRef>
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
  kind?: string
  from: ConnectionEndpoint
  to: ConnectionEndpoint
  style?: ConnectionStyle
  hoverable?: boolean
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
  proxied?: { from?: boolean; to?: boolean }
}

export interface PortLayout {
  key: string
  blockId: string
  portId?: string
  point: Point
  role?: ConnectPortRole
  connected?: number
  state?: 'idle' | ConnectPortState
  hovered?: boolean
}

export interface VisualLinkerEventMap {
  'block:dragstart': { blockId: string }
  'block:drag': { blockId: string; x: number; y: number }
  'block:dragend': { blockId: string; x: number; y: number }
  'block:mouseenter': { blockId: string; via?: 'pointer' | 'line' }
  'block:mouseleave': { blockId: string; via?: 'pointer' | 'line' }
  'connection:click': { connection: ConnectionDescriptor }
  'connection:mouseenter': { connection: ConnectionDescriptor }
  'connection:mouseleave': { connection: ConnectionDescriptor }
  'connection:selectionchange': { selectedIds: string[] }
  'connection:delete-request': { connections: ConnectionDescriptor[] }
  layout: { connections: ConnectionLayout[]; ports: PortLayout[] }
  'connect:start': { from: ConnectionEndpoint; via: ConnectVia | 'api' }
  'connect:candidate': { from: ConnectionEndpoint; candidate: ConnectionEndpoint | null; valid: boolean }
  'connection:create-request': {
    from: ConnectionEndpoint
    to: ConnectionEndpoint
    via: ConnectVia
    modifiers: { shift: boolean; ctrl: boolean; alt: boolean; meta: boolean }
  }
  'connection:create-cancel': { from: ConnectionEndpoint; reason: ConnectCancelReason; message?: string }
}
