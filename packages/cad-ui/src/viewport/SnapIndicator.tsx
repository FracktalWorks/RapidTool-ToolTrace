import React, { useRef, useMemo } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { SnappingSystem, SnapPoint } from '@rapidtool/cad-core';

interface SnapIndicatorProps {
  snapSystem: SnappingSystem;
  cursorPosition: THREE.Vector3;
  snapRadius?: number;
}

const SnapIndicator: React.FC<SnapIndicatorProps> = ({
  snapSystem,
  cursorPosition,
  snapRadius = 3
}) => {
  const snapPointsRef = useRef<THREE.Group>(null);
  const snapLinesRef = useRef<THREE.Group>(null);

  // Get snap points near cursor for visualization
  const nearbySnapPoints = useMemo(() => {
    return snapSystem.getSnapPointsInRadius(cursorPosition, snapRadius);
  }, [snapSystem, cursorPosition, snapRadius]);

  // Create visual indicators for snap points
  const snapPointMeshes = useMemo(() => {
    return nearbySnapPoints.map((point, index) => {
      const color = getSnapPointColor(point.type);
      const size = getSnapPointSize(point.type);

      return (
        <mesh key={`snap-${index}`} position={point.position}>
          <sphereGeometry args={[size, 8, 8]} />
          <meshBasicMaterial color={color} transparent opacity={0.8} />
        </mesh>
      );
    });
  }, [nearbySnapPoints]);

  // Create snap lines (for grid alignment)
  const snapLines = useMemo(() => {
    const lines: JSX.Element[] = [];

    // Add grid lines around cursor
    const gridSize = 5;
    const halfGrid = 2;

    for (let i = -halfGrid; i <= halfGrid; i++) {
      // X-axis lines
      lines.push(
        <line key={`grid-x-${i}`}>
          <bufferGeometry>
            <bufferAttribute
              attach="attributes-position"
              array={new Float32Array([
                cursorPosition.x + i * gridSize, cursorPosition.y - 1, cursorPosition.z - halfGrid * gridSize,
                cursorPosition.x + i * gridSize, cursorPosition.y - 1, cursorPosition.z + halfGrid * gridSize
              ])}
              count={2}
              itemSize={3}
            />
          </bufferGeometry>
          <lineBasicMaterial color="#00ff00" opacity={0.3} transparent />
        </line>
      );

      // Z-axis lines
      lines.push(
        <line key={`grid-z-${i}`}>
          <bufferGeometry>
            <bufferAttribute
              attach="attributes-position"
              array={new Float32Array([
                cursorPosition.x - halfGrid * gridSize, cursorPosition.y - 1, cursorPosition.z + i * gridSize,
                cursorPosition.x + halfGrid * gridSize, cursorPosition.y - 1, cursorPosition.z + i * gridSize
              ])}
              count={2}
              itemSize={3}
            />
          </bufferGeometry>
          <lineBasicMaterial color="#00ff00" opacity={0.3} transparent />
        </line>
      );
    }

    return lines;
  }, [cursorPosition]);

  return (
    <group>
      {/* Snap point indicators */}
      <group ref={snapPointsRef}>
        {snapPointMeshes}
      </group>

      {/* Grid lines */}
      <group ref={snapLinesRef}>
        {snapLines}
      </group>

      {/* Cursor position indicator */}
      <mesh position={cursorPosition}>
        <sphereGeometry args={[0.1, 8, 8]} />
        <meshBasicMaterial color="#ffff00" />
      </mesh>
    </group>
  );
};

// Helper functions for snap point visualization
function getSnapPointColor(type: SnapPoint['type']): string {
  switch (type) {
    case 'grid': return '#00ff00';
    case 'vertex': return '#ff0000';
    case 'edge': return '#0000ff';
    case 'face': return '#ff00ff';
    case 'center': return '#ffff00';
    default: return '#ffffff';
  }
}

function getSnapPointSize(type: SnapPoint['type']): number {
  switch (type) {
    case 'grid': return 0.05;
    case 'vertex': return 0.08;
    case 'edge': return 0.06;
    case 'face': return 0.1;
    case 'center': return 0.12;
    default: return 0.05;
  }
}

export default SnapIndicator;
