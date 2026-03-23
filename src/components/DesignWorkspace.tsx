/**
 * DesignWorkspace
 * 
 * 3D workspace for the "3D Design" step where users can:
 * - View extruded tool holder design
 * - Adjust depth, wall thickness, and other parameters
 * - Rotate and zoom the 3D model
 */

import React, { useRef, useMemo, useEffect } from 'react';
import { Canvas, useThree } from '@react-three/fiber';
import type { ThreeElements } from '@react-three/fiber';
import { OrbitControls, GizmoHelper, GizmoViewport, Grid, Environment } from '@react-three/drei';
import * as THREE from 'three';
import { useAppStore, type LayoutShape, type DesignSettings } from '../stores';
import { RotateCcw, Box } from 'lucide-react';

// Extend JSX.IntrinsicElements for R3F
declare module 'react' {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace JSX {
    interface IntrinsicElements extends ThreeElements { }
  }
}

// ============================================================================
// Types
// ============================================================================

// Re-export from store for internal use
export type { DesignSettings } from '../stores';

// ============================================================================
// Utility Functions
// ============================================================================

/**
 * Create a hole path for a shape (used to punch holes in base)
 * NOTE: Holes must be drawn COUNTER-CLOCKWISE for proper Three.js rendering
 */
function createShapeHolePath(
  shape: LayoutShape,
  layoutWidth: number,
  layoutHeight: number,
  toolOutlines: ReturnType<typeof useAppStore.getState>['toolOutlines'],
  pixelsPerMm: number | null
): THREE.Path | null {
  const hole = new THREE.Path();

  // Convert from layout coords (top-left origin) to centered coords
  const centerX = shape.x + shape.width / 2 - layoutWidth / 2;
  const centerY = -(shape.y + shape.height / 2 - layoutHeight / 2); // Flip Y

  if (shape.type === 'tool' && shape.toolOutlineId && pixelsPerMm) {
    const outline = toolOutlines.find(o => o.id === shape.toolOutlineId);
    if (!outline || outline.smoothedPoints.length < 3) return null;

    const { smoothedPoints, boundingBox } = outline;
    const bboxWidth = boundingBox.maxX - boundingBox.minX;
    const bboxHeight = boundingBox.maxY - boundingBox.minY;

    const scaleX = shape.width / (bboxWidth / pixelsPerMm);
    const scaleY = shape.height / (bboxHeight / pixelsPerMm);

    const points = smoothedPoints.map((p) => ({
      x: centerX + ((p.x - boundingBox.minX) / pixelsPerMm) * scaleX - shape.width / 2,
      y: centerY - ((p.y - boundingBox.minY) / pixelsPerMm) * scaleY + shape.height / 2,
    }));

    if (points.length < 3) return null;

    // Check winding order and reverse if clockwise (we need counter-clockwise for holes)
    // Calculate signed area to determine winding
    let signedArea = 0;
    for (let i = 0; i < points.length; i++) {
      const j = (i + 1) % points.length;
      signedArea += points[i].x * points[j].y;
      signedArea -= points[j].x * points[i].y;
    }

    // If signedArea > 0, it's counter-clockwise (correct for holes)
    // If signedArea < 0, it's clockwise (need to reverse)
    const orderedPoints = signedArea < 0 ? points : [...points].reverse();

    hole.moveTo(orderedPoints[0].x, orderedPoints[0].y);
    for (let i = 1; i < orderedPoints.length; i++) {
      hole.lineTo(orderedPoints[i].x, orderedPoints[i].y);
    }
    hole.closePath();
  } else {
    const halfW = shape.width / 2;
    const halfH = shape.height / 2;

    switch (shape.type) {
      case 'circle': {
        // Draw circle COUNTER-CLOCKWISE (clockwise = true parameter for absellipse)
        const segments = 32;
        for (let i = segments; i >= 0; i--) {
          const angle = (i / segments) * Math.PI * 2;
          const x = centerX + Math.cos(angle) * halfW;
          const y = centerY + Math.sin(angle) * halfH;
          if (i === segments) hole.moveTo(x, y);
          else hole.lineTo(x, y);
        }
        break;
      }
      case 'finger-notch': {
        // Pill shape - drawn counter-clockwise
        const radius = Math.min(halfW, halfH);
        hole.moveTo(centerX - halfW + radius, centerY - halfH);
        hole.absarc(centerX - halfW + radius, centerY, halfH, -Math.PI / 2, Math.PI / 2, false);
        hole.lineTo(centerX + halfW - radius, centerY + halfH);
        hole.absarc(centerX + halfW - radius, centerY, halfH, Math.PI / 2, -Math.PI / 2, false);
        hole.closePath();
        break;
      }
      case 'square':
      case 'rectangle':
      default:
        // Draw rectangle COUNTER-CLOCKWISE
        hole.moveTo(centerX - halfW, centerY - halfH);
        hole.lineTo(centerX - halfW, centerY + halfH);
        hole.lineTo(centerX + halfW, centerY + halfH);
        hole.lineTo(centerX + halfW, centerY - halfH);
        hole.closePath();
        break;
    }
  }

  return hole;
}

/**
 * Create solid base plate (bottom of the holder)
 */
function createSolidBasePlate(
  width: number,
  height: number,
  thickness: number,
  chamfer: number
): THREE.ExtrudeGeometry {
  const r = chamfer;

  // Create outer shape with rounded corners
  const baseShape = new THREE.Shape();
  baseShape.moveTo(-width / 2 + r, -height / 2);
  baseShape.lineTo(width / 2 - r, -height / 2);
  baseShape.quadraticCurveTo(width / 2, -height / 2, width / 2, -height / 2 + r);
  baseShape.lineTo(width / 2, height / 2 - r);
  baseShape.quadraticCurveTo(width / 2, height / 2, width / 2 - r, height / 2);
  baseShape.lineTo(-width / 2 + r, height / 2);
  baseShape.quadraticCurveTo(-width / 2, height / 2, -width / 2, height / 2 - r);
  baseShape.lineTo(-width / 2, -height / 2 + r);
  baseShape.quadraticCurveTo(-width / 2, -height / 2, -width / 2 + r, -height / 2);

  return new THREE.ExtrudeGeometry(baseShape, {
    depth: thickness,
    bevelEnabled: true,
    bevelThickness: Math.min(1, thickness / 3),
    bevelSize: Math.min(1, thickness / 3),
    bevelSegments: 2,
  });
}

/**
 * Create walls with inner pocket (the area inside walls where tools go)
 */
function createWallsWithPocket(
  width: number,
  height: number,
  wallThickness: number,
  pocketDepth: number,
  chamfer: number
): THREE.ExtrudeGeometry {
  const r = chamfer;
  const t = wallThickness;

  // Outer boundary with rounded corners
  const wallShape = new THREE.Shape();
  wallShape.moveTo(-width / 2 + r, -height / 2);
  wallShape.lineTo(width / 2 - r, -height / 2);
  wallShape.quadraticCurveTo(width / 2, -height / 2, width / 2, -height / 2 + r);
  wallShape.lineTo(width / 2, height / 2 - r);
  wallShape.quadraticCurveTo(width / 2, height / 2, width / 2 - r, height / 2);
  wallShape.lineTo(-width / 2 + r, height / 2);
  wallShape.quadraticCurveTo(-width / 2, height / 2, -width / 2, height / 2 - r);
  wallShape.lineTo(-width / 2, -height / 2 + r);
  wallShape.quadraticCurveTo(-width / 2, -height / 2, -width / 2 + r, -height / 2);

  // Inner pocket boundary (counter-clockwise for hole)
  const innerW = width / 2 - t;
  const innerH = height / 2 - t;
  const innerR = Math.max(r - t * 0.5, 0.5);

  const pocketHole = new THREE.Path();
  pocketHole.moveTo(-innerW + innerR, -innerH);
  pocketHole.lineTo(innerW - innerR, -innerH);
  pocketHole.quadraticCurveTo(innerW, -innerH, innerW, -innerH + innerR);
  pocketHole.lineTo(innerW, innerH - innerR);
  pocketHole.quadraticCurveTo(innerW, innerH, innerW - innerR, innerH);
  pocketHole.lineTo(-innerW + innerR, innerH);
  pocketHole.quadraticCurveTo(-innerW, innerH, -innerW, innerH - innerR);
  pocketHole.lineTo(-innerW, -innerH + innerR);
  pocketHole.quadraticCurveTo(-innerW, -innerH, -innerW + innerR, -innerH);

  wallShape.holes.push(pocketHole);

  return new THREE.ExtrudeGeometry(wallShape, {
    depth: pocketDepth,
    bevelEnabled: false,
  });
}

/**
 * Create the raised floor inside the pocket (with cutout holes for tools)
 */
function createPocketFloorWithCutouts(
  width: number,
  height: number,
  wallThickness: number,
  floorThickness: number,
  chamfer: number,
  shapes: LayoutShape[],
  toolOutlines: ReturnType<typeof useAppStore.getState>['toolOutlines'],
  pixelsPerMm: number | null
): THREE.ExtrudeGeometry {
  const t = wallThickness;
  const r = Math.max(chamfer - t * 0.5, 0.5);

  // Inner pocket dimensions
  const innerW = width / 2 - t;
  const innerH = height / 2 - t;

  // Create inner floor shape
  const floorShape = new THREE.Shape();
  floorShape.moveTo(-innerW + r, -innerH);
  floorShape.lineTo(innerW - r, -innerH);
  floorShape.quadraticCurveTo(innerW, -innerH, innerW, -innerH + r);
  floorShape.lineTo(innerW, innerH - r);
  floorShape.quadraticCurveTo(innerW, innerH, innerW - r, innerH);
  floorShape.lineTo(-innerW + r, innerH);
  floorShape.quadraticCurveTo(-innerW, innerH, -innerW, innerH - r);
  floorShape.lineTo(-innerW, -innerH + r);
  floorShape.quadraticCurveTo(-innerW, -innerH, -innerW + r, -innerH);

  // Punch holes for each shape (these go through the raised floor)
  shapes.forEach((shape) => {
    const holePath = createShapeHolePath(shape, width, height, toolOutlines, pixelsPerMm);
    if (holePath) {
      floorShape.holes.push(holePath);
    }
  });

  return new THREE.ExtrudeGeometry(floorShape, {
    depth: floorThickness,
    bevelEnabled: false,
  });
}

/**
 * Create Gridfinity-style base with magnet holes
 */
function createGridfinityBase(
  width: number,
  height: number,
  cellSize: number = 42
): THREE.BufferGeometry {
  const magnetRadius = 3.25; // 6.5mm diameter magnets
  const magnetDepth = 2.5;

  const cols = Math.floor(width / cellSize);
  const rows = Math.floor(height / cellSize);

  const positions: number[] = [];
  const indices: number[] = [];

  // Create magnet hole positions at corners of each cell
  for (let col = 0; col <= cols; col++) {
    for (let row = 0; row <= rows; row++) {
      const x = col * cellSize - width / 2;
      const y = row * cellSize - height / 2;

      // Only add if within bounds
      if (Math.abs(x) <= width / 2 - 5 && Math.abs(y) <= height / 2 - 5) {
        // Create cylinder geometry for magnet hole
        const segments = 16;
        const baseIndex = positions.length / 3;

        // Bottom center
        positions.push(x, y, -magnetDepth);

        // Bottom ring
        for (let i = 0; i < segments; i++) {
          const angle = (i / segments) * Math.PI * 2;
          positions.push(
            x + Math.cos(angle) * magnetRadius,
            y + Math.sin(angle) * magnetRadius,
            -magnetDepth
          );
        }

        // Top ring
        for (let i = 0; i < segments; i++) {
          const angle = (i / segments) * Math.PI * 2;
          positions.push(
            x + Math.cos(angle) * magnetRadius,
            y + Math.sin(angle) * magnetRadius,
            0
          );
        }

        // Bottom cap triangles
        for (let i = 0; i < segments; i++) {
          indices.push(
            baseIndex,
            baseIndex + 1 + i,
            baseIndex + 1 + ((i + 1) % segments)
          );
        }

        // Side triangles
        for (let i = 0; i < segments; i++) {
          const b1 = baseIndex + 1 + i;
          const b2 = baseIndex + 1 + ((i + 1) % segments);
          const t1 = baseIndex + 1 + segments + i;
          const t2 = baseIndex + 1 + segments + ((i + 1) % segments);
          indices.push(b1, t1, b2);
          indices.push(b2, t1, t2);
        }
      }
    }
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();

  return geometry;
}

// ============================================================================
// 3D Components
// ============================================================================

interface ToolHolderMeshProps {
  layoutState: ReturnType<typeof useAppStore.getState>['layoutState'];
  toolOutlines: ReturnType<typeof useAppStore.getState>['toolOutlines'];
  pixelsPerMm: number | null;
  settings: DesignSettings;
}

const ToolHolderMesh: React.FC<ToolHolderMeshProps> = ({
  layoutState,
  toolOutlines,
  pixelsPerMm,
  settings,
}) => {
  const { grid, shapes } = layoutState;
  const meshRef = useRef<THREE.Group>(null);

  // Calculate layout dimensions in mm
  const layoutWidth = grid.cols * grid.cellWidthMm;
  const layoutHeight = grid.rows * grid.cellHeightMm;

  // Create solid base plate (bottom of the holder - always solid, no holes)
  const basePlateGeometry = useMemo(() => {
    return createSolidBasePlate(
      layoutWidth,
      layoutHeight,
      settings.baseHeight,
      settings.chamferSize
    );
  }, [layoutWidth, layoutHeight, settings.baseHeight, settings.chamferSize]);

  // Create walls around the perimeter with inner pocket (on top of base plate)
  const wallsGeometry = useMemo(() => {
    return createWallsWithPocket(
      layoutWidth,
      layoutHeight,
      settings.wallThickness,
      settings.cutoutDepth,
      settings.chamferSize
    );
  }, [layoutWidth, layoutHeight, settings.wallThickness, settings.cutoutDepth, settings.chamferSize]);

  // Create raised floor inside pocket with tool cutout holes
  const pocketFloorGeometry = useMemo(() => {
    // This is the "raised floor" inside the walls that has the tool cutouts
    // It sits on top of the base plate, inside the walls
    const raisedFloorHeight = settings.cutoutDepth - settings.baseHeight;
    if (raisedFloorHeight <= 0) return null;

    return createPocketFloorWithCutouts(
      layoutWidth,
      layoutHeight,
      settings.wallThickness,
      raisedFloorHeight,
      settings.chamferSize,
      shapes,
      toolOutlines,
      pixelsPerMm
    );
  }, [layoutWidth, layoutHeight, settings.wallThickness, settings.cutoutDepth, settings.baseHeight, settings.chamferSize, shapes, toolOutlines, pixelsPerMm]);

  // Gridfinity base pattern (magnet holes) - punches into the bottom of base plate
  const gridfinityGeometry = useMemo(() => {
    if (!settings.gridfinityBase) return null;
    return createGridfinityBase(layoutWidth, layoutHeight, grid.cellWidthMm);
  }, [layoutWidth, layoutHeight, grid.cellWidthMm, settings.gridfinityBase]);

  // Material for the holder walls and inner parts
  const holderMaterial = useMemo(() => {
    return new THREE.MeshStandardMaterial({
      color: 0x707070,
      roughness: 0.5,
      metalness: 0.1,
      side: THREE.FrontSide,
    });
  }, []);

  // Material for the base plate (black for visibility)
  const basePlateMaterial = useMemo(() => {
    return new THREE.MeshStandardMaterial({
      color: 0x000000,
      roughness: 0.4,
      metalness: 0.2,
      side: THREE.FrontSide,
    });
  }, []);

  // Material for gridfinity holes (darker)
  const gridfinityMaterial = useMemo(() => {
    return new THREE.MeshStandardMaterial({
      color: 0x404040,
      roughness: 0.7,
      metalness: 0,
      side: THREE.DoubleSide,
    });
  }, []);

  return (
    <group ref={meshRef} rotation={[-Math.PI / 2, 0, 0]}>
      {/* Solid base plate (bottom - always solid) */}
      <mesh geometry={basePlateGeometry} material={basePlateMaterial} />

      {/* Walls with inner pocket - sits on top of base plate */}
      <mesh
        geometry={wallsGeometry}
        material={holderMaterial}
        position={[0, 0, settings.baseHeight]}
      />

      {/* Raised floor inside pocket with tool cutout holes */}
      {pocketFloorGeometry && (
        <mesh
          geometry={pocketFloorGeometry}
          material={holderMaterial}
          position={[0, 0, settings.baseHeight]}
        />
      )}

      {/* Gridfinity magnet holes - on bottom of base plate */}
      {gridfinityGeometry && (
        <mesh
          geometry={gridfinityGeometry}
          material={gridfinityMaterial}
          position={[0, 0, 0]}
        />
      )}
    </group>
  );
};

interface SceneProps {
  layoutState: ReturnType<typeof useAppStore.getState>['layoutState'];
  toolOutlines: ReturnType<typeof useAppStore.getState>['toolOutlines'];
  pixelsPerMm: number | null;
  settings: DesignSettings;
  onControlsReady: (controls: any) => void;
}

const Scene: React.FC<SceneProps> = ({ layoutState, toolOutlines, pixelsPerMm, settings, onControlsReady }) => {
  const { camera } = useThree();
  const controlsRef = useRef<any>(null);

  // Calculate layout dimensions for camera positioning
  const layoutWidth = layoutState.grid.cols * layoutState.grid.cellWidthMm;
  const layoutHeight = layoutState.grid.rows * layoutState.grid.cellHeightMm;
  const maxDim = Math.max(layoutWidth, layoutHeight);

  // Set initial camera position
  useEffect(() => {
    if (camera) {
      camera.position.set(maxDim * 0.8, maxDim * 0.8, maxDim * 0.8);
      camera.lookAt(0, 0, 0);
    }
  }, [camera, maxDim]);

  // Expose controls to parent when mounted
  const handleControlsRef = (controls: any) => {
    controlsRef.current = controls;
    if (controls) {
      onControlsReady(controls);
    }
  };

  return (
    <>
      {/* Lighting */}
      <ambientLight intensity={0.4} />
      <directionalLight
        position={[100, 100, 100]}
        intensity={1}
        castShadow
        shadow-mapSize={[2048, 2048]}
      />
      <directionalLight position={[-50, 50, -50]} intensity={0.5} />
      <pointLight position={[0, 100, 0]} intensity={0.3} />

      {/* Environment */}
      <Environment preset="studio" />

      {/* Tool Holder Mesh */}
      <ToolHolderMesh
        layoutState={layoutState}
        toolOutlines={toolOutlines}
        pixelsPerMm={pixelsPerMm}
        settings={settings}
      />

      {/* Grid helper */}
      <Grid
        args={[300, 300]}
        cellSize={10}
        cellThickness={0.5}
        cellColor="#444444"
        sectionSize={42}
        sectionThickness={1}
        sectionColor="#666666"
        fadeDistance={400}
        fadeStrength={1}
        position={[0, -0.1, 0]}
      />

      {/* Orbit Controls */}
      <OrbitControls
        ref={handleControlsRef}
        makeDefault
        enableDamping
        dampingFactor={0.05}
        minDistance={20}
        maxDistance={500}
        maxPolarAngle={Math.PI / 2 + 0.1}
      />

      {/* Gizmo */}
      <GizmoHelper alignment="bottom-right" margin={[80, 80]}>
        <GizmoViewport
          axisColors={['#f73c4e', '#6be96b', '#4d9cf7']}
          labelColor="white"
        />
      </GizmoHelper>
    </>
  );
};

// ============================================================================
// View Controls Component
// ============================================================================

interface ViewControlsProps {
  onResetView: () => void;
  gridSize: string;
}

const ViewControls: React.FC<ViewControlsProps> = ({ onResetView, gridSize }) => {
  return (
    <>
      {/* Grid size label */}
      <div className="absolute bottom-16 left-1/2 transform -translate-x-1/2 bg-[hsl(var(--card))/90] backdrop-blur-sm px-3 py-1.5 rounded-md text-xs text-[hsl(var(--muted-foreground))] font-tech shadow-sm">
        {gridSize} Grid
      </div>

      {/* Reset view button */}
      <button
        onClick={onResetView}
        className="absolute top-4 right-4 flex items-center gap-1.5 px-2.5 py-1.5 bg-[hsl(var(--card))/90] backdrop-blur-sm border border-[hsl(var(--border))] rounded-lg shadow-sm hover:bg-[hsl(var(--muted))] transition-colors"
        title="Reset camera view"
      >
        <RotateCcw className="w-3.5 h-3.5 text-[hsl(var(--muted-foreground))]" />
        <span className="text-xs">Reset View</span>
      </button>

      {/* Navigation hints */}
      <div className="absolute bottom-4 left-4 flex items-center gap-2 text-[10px] text-[hsl(var(--muted-foreground))] bg-[hsl(var(--card))/80] backdrop-blur-sm px-2.5 py-1.5 rounded-md">
        <Box className="w-3 h-3" />
        <span>Left-click drag to rotate • Right-click drag to pan • Scroll to zoom</span>
      </div>
    </>
  );
};

// ============================================================================
// Main Component
// ============================================================================

export const DesignWorkspace: React.FC = () => {
  const {
    layoutState,
    toolOutlines,
    pixelsPerMm,
    designSettings,
  } = useAppStore();

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const controlsRef = useRef<any>(null);

  const handleControlsReady = (controls: any) => {
    controlsRef.current = controls;
  };

  const handleResetView = () => {
    if (controlsRef.current) {
      // Reset the orbit controls to initial state
      controlsRef.current.reset();
    }
  };

  const { grid } = layoutState;
  const gridSize = `${grid.cols}×${grid.rows}`;

  return (
    <div className="relative h-full w-full bg-[hsl(var(--workspace-bg))]">
      {/* Three.js Canvas */}
      <Canvas
        ref={canvasRef}
        shadows
        camera={{
          fov: 45,
          near: 0.1,
          far: 2000,
          position: [150, 150, 150],
        }}
        gl={{
          antialias: true,
          toneMapping: THREE.ACESFilmicToneMapping,
          toneMappingExposure: 1,
        }}
      >
        <Scene
          layoutState={layoutState}
          toolOutlines={toolOutlines}
          pixelsPerMm={pixelsPerMm}
          settings={designSettings}
          onControlsReady={handleControlsReady}
        />
      </Canvas>

      {/* Overlay Controls */}
      <ViewControls onResetView={handleResetView} gridSize={gridSize} />

      {/* Design Info */}
      <div className="absolute top-4 left-4 flex items-center gap-3 bg-[hsl(var(--card))/90] backdrop-blur-sm border border-[hsl(var(--border))] rounded-lg px-3 py-1.5 shadow-sm">
        <span className="text-xs font-tech text-[hsl(var(--muted-foreground))]">
          {grid.cols * grid.cellWidthMm} × {grid.rows * grid.cellHeightMm} mm
        </span>
        <div className="w-px h-3 bg-[hsl(var(--border))]" />
        <span className="text-xs text-[hsl(var(--muted-foreground))]">
          {layoutState.shapes.length} cutout{layoutState.shapes.length !== 1 ? 's' : ''}
        </span>
        <div className="w-px h-3 bg-[hsl(var(--border))]" />
        <span className="text-xs text-[hsl(var(--muted-foreground))]">
          Depth: {designSettings.cutoutDepth}mm
        </span>
      </div>
    </div>
  );
};
