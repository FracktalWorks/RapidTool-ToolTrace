/**
 * Minimal type declarations for clipper-lib 6.4.2
 * Only the surface used by ToolTrace's polygon offsetting is declared.
 * Full library: http://www.angusj.com/delphi/clipper.php
 */
declare module 'clipper-lib' {
  export interface IntPoint {
    X: number;
    Y: number;
  }

  export interface IntPointConstructor {
    new (x: number, y: number): IntPoint;
  }

  export type Path = IntPoint[];
  export type Paths = IntPoint[][];

  export enum JoinType {
    jtSquare = 0,
    jtRound = 1,
    jtMiter = 2,
  }

  export enum EndType {
    etOpenSquare = 0,
    etOpenRound = 1,
    etOpenButt = 2,
    etClosedLine = 3,
    etClosedPolygon = 4,
  }

  export enum PolyFillType {
    pftEvenOdd = 0,
    pftNonZero = 1,
    pftPositive = 2,
    pftNegative = 3,
  }

  export class ClipperOffset {
    constructor(miterLimit?: number, roundPrecision?: number);
    AddPath(path: Path, joinType: JoinType, endType: EndType): void;
    AddPaths(paths: Paths, joinType: JoinType, endType: EndType): void;
    Execute(solution: Paths, delta: number): void;
    Clear(): void;
  }

  export const Clipper: {
    CleanPolygon(path: Path, distance?: number): Path;
    CleanPolygons(paths: Paths, distance?: number): Paths;
    SimplifyPolygon(path: Path, fillType?: PolyFillType): Paths;
    SimplifyPolygons(paths: Paths, fillType?: PolyFillType): Paths;
    Area(path: Path): number;
    Orientation(path: Path): boolean;
  };

  const ClipperLib: {
    IntPoint: IntPointConstructor;
    Path: { new (): Path };
    Paths: { new (): Paths };
    JoinType: typeof JoinType;
    EndType: typeof EndType;
    PolyFillType: typeof PolyFillType;
    ClipperOffset: typeof ClipperOffset;
    Clipper: typeof Clipper;
  };

  export default ClipperLib;
}
