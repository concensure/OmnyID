// @locs-version: 1.0
// Ambient declarations for optional vendor packages not yet installed.
// These allow TypeScript to compile without errors when packages are absent.
// Remove these declarations once the packages are installed.

declare module "mathlive" {
  export class MathfieldElement extends HTMLElement {
    value: string;
    readOnly: boolean;
    placeholder: string;
    virtualKeyboardMode: string;
    getValue(format?: string): string;
    setValue(value: string, opts?: { silenceNotifications?: boolean }): void;
    addEventListener(event: string, handler: (...args: unknown[]) => void): void;
    removeEventListener(event: string, handler: (...args: unknown[]) => void): void;
  }
}

declare module "mathlive/static.css" {}

declare module "leaflet" {
  export type LatLngExpression = [number, number] | [number, number, number] | { lat: number; lng: number; alt?: number };
  export type LatLngBoundsExpression = LatLngExpression[] | [[number, number], [number, number]];
  export interface LeafletMouseEvent { latlng: LatLng; originalEvent: MouseEvent; }
  export interface MapOptions { center?: LatLngExpression; zoom?: number; zoomControl?: boolean; scrollWheelZoom?: boolean; }
  export interface TileLayerOptions { attribution?: string; maxZoom?: number; subdomains?: string | string[]; }
  export interface PolylineOptions { color?: string; weight?: number; opacity?: number; dashArray?: string; }
  export interface CircleOptions { radius?: number; color?: string; fillColor?: string; fillOpacity?: number; weight?: number; dashArray?: string; }
  export interface CircleMarkerOptions { radius?: number; color?: string; fillColor?: string; fillOpacity?: number; }
  export interface MarkerOptions { title?: string; icon?: DivIcon | Icon; }
  export interface IconOptions { html?: string; className?: string; iconSize?: [number, number]; iconAnchor?: [number, number]; popupAnchor?: [number, number]; }
  export interface DivIcon { options: IconOptions; }
  export interface Icon { options: IconOptions; }
  export interface LatLng { lat: number; lng: number; alt?: number; distanceTo(other: LatLng): number; }
  export interface Circle extends Layer { bindPopup(content: string): this; openPopup(): this; setRadius(radius: number): this; }
  export interface Layer { addTo(map: Map): this; remove(): this; }
  export interface Path extends Layer { bindPopup(content: string): this; openPopup(): this; }
  export interface Marker extends Layer {
    bindPopup(content: string): this;
    openPopup(): this;
    setLatLng(latlng: LatLngExpression): this;
    on(event: string, handler: (e: LeafletMouseEvent) => void): this;
  }
  export interface Polyline extends Path {}
  export interface CircleMarker extends Path {}
  export interface Map {
    remove(): void;
    fitBounds(bounds: LatLngBoundsExpression, opts?: { padding?: [number, number] }): this;
    setView(center: LatLngExpression, zoom?: number): this;
    on(event: string, handler: (e: LeafletMouseEvent) => void): this;
  }
  export function map(el: HTMLElement, opts?: MapOptions): Map;
  export function tileLayer(url: string, opts?: TileLayerOptions): Layer & { addTo(map: Map): Layer };
  export function marker(latlng: LatLngExpression, opts?: MarkerOptions): Marker;
  export function polyline(latlngs: LatLngExpression[], opts?: PolylineOptions): Polyline;
  export function circleMarker(latlng: LatLngExpression, opts?: CircleMarkerOptions): CircleMarker;
  export function circle(latlng: LatLngExpression, opts?: CircleOptions): Circle;
  export function latLngBounds(corner1: LatLngExpression, corner2: LatLngExpression): LatLngBoundsExpression;
  export function divIcon(opts?: IconOptions): DivIcon;
  export { };
}

declare module "leaflet/dist/leaflet.css" {}

// ── File conversion libraries (no @types published) ──────────────────────────
declare module "mammoth" {
  interface ConvertResult { value: string; messages: unknown[] }
  interface Options { arrayBuffer?: ArrayBuffer; path?: string; buffer?: Buffer }
  const mammoth: {
    convertToHtml(options: Options): Promise<ConvertResult>;
    extractRawText(options: Options): Promise<ConvertResult>;
  };
  export = mammoth;
}


declare module "pptxgenjs" {
  export default class PptxGenJS {
    layout: string;
    addSlide(): Slide;
    write(opts: { outputType: "arraybuffer" }): Promise<ArrayBuffer>;
    write(opts?: Record<string, unknown>): Promise<unknown>;
    writeFile(filename: string): Promise<void>;
  }
  interface TextOptions {
    x?: number; y?: number; w?: number; h?: number;
    fontSize?: number; bold?: boolean; color?: string;
    bullet?: boolean; breakLine?: boolean;
  }
  interface TextItem { text: string; options?: TextOptions }
  interface Slide {
    addText(text: string | TextItem[], opts?: TextOptions): void;
  }
}

declare module "d3" {
  export interface SimulationNodeDatum {
    index?: number;
    x?: number;
    y?: number;
    vx?: number;
    vy?: number;
    fx?: number | null;
    fy?: number | null;
  }
  export interface SimulationLinkDatum<N extends SimulationNodeDatum> {
    source: N | string | number;
    target: N | string | number;
    index?: number;
  }
  export interface D3ZoomEvent<E extends Element, D> {
    transform: { k: number; x: number; y: number; toString(): string };
    sourceEvent: Event;
    target: ZoomBehavior<E, D>;
    type: string;
  }
  export interface Selection<GElement, Datum, PElement, PDatum> {
    append<E extends Element = Element>(type: string): Selection<E, Datum, GElement, PDatum>;
    attr(name: string, value: string | number | null | ((d: Datum, i: number) => string | number | null)): this;
    style(name: string, value: string | number | null | ((d: Datum) => string | number | null)): this;
    text(value: string | ((d: Datum) => string)): this;
    on(type: string, listener: (event: Event, d: Datum) => void): this;
    on(type: string, listener: (event: Event) => void): this;
    call<T>(fn: (sel: this, ...args: T[]) => void | this, ...args: T[]): this;
    selectAll<E extends Element, D = Datum>(selector: string): Selection<E, D, GElement, Datum>;
    data<D>(data: D[]): Selection<GElement, D, PElement, PDatum>;
    join<E extends Element = Element>(type: string): Selection<E, Datum, PElement, PDatum>;
    remove(): this;
    node(): GElement | null;
  }
  export interface ForceSimulation<N extends SimulationNodeDatum> {
    force(name: string, force?: object | null): this;
    on(type: string, listener: ((this: ForceSimulation<N>) => void) | null): this;
    alpha(value?: number): this;
    alphaMin(value?: number): this;
    alphaTarget(value?: number): this;
    alphaDecay(value?: number): this;
    nodes(nodes?: N[]): this;
    tick(iterations?: number): this;
    restart(): this;
    stop(): this;
  }
  export interface ZoomBehavior<E extends Element, D> {
    scaleExtent(extent: [number, number]): this;
    on(type: string, listener: (event: D3ZoomEvent<E, D>) => void): this;
    transform(selection: Selection<E, D, any, any>, transform: any): void;
    translateBy(selection: Selection<E, D, any, any>, x: number, y: number): void;
    scaleTo(selection: Selection<E, D, any, any>, k: number): void;
  }
  export interface DragBehavior<E extends Element, D, S> {
    on(type: string, listener: (event: { x: number; y: number; active: boolean; sourceEvent: Event }, d: D) => void): this;
    on(type: string, listener: null): this;
  }
  export function select<E extends Element>(el: E | null | string): Selection<E, unknown, null, undefined>;
  export function selectAll<E extends Element, D = unknown>(selector: string): Selection<E, D, null, undefined>;
  export function forceSimulation<N extends SimulationNodeDatum>(nodes?: N[]): ForceSimulation<N>;
  export function forceManyBody<N extends SimulationNodeDatum>(): { strength(v: number | ((d: N) => number)): this; distanceMin(v: number): this; distanceMax(v: number): this };
  export function forceLink<N extends SimulationNodeDatum, L extends SimulationLinkDatum<N>>(links?: L[]): {
    id(fn: (d: N) => string | number): this;
    distance(v: number | ((d: L) => number)): this;
    strength(v: number | ((d: L) => number)): this;
    links(links: L[]): this;
  };
  export function forceCenter<N extends SimulationNodeDatum>(x?: number, y?: number): object;
  export function forceCollide<N extends SimulationNodeDatum>(radius?: number | ((d: N) => number)): object;
  export function zoom<E extends Element, D>(): ZoomBehavior<E, D>;
  export function drag<E extends Element, D, S = Element>(): DragBehavior<E, D, S>;
  export const zoomIdentity: { k: number; x: number; y: number; toString(): string };
}
