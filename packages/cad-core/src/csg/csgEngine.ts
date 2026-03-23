import * as THREE from 'three';
import { SUBTRACTION, Brush, Evaluator } from 'three-bvh-csg';

export interface CSGOperation {
  type: 'union' | 'subtract' | 'intersect';
  targetMesh: THREE.Mesh;
  toolMeshes: THREE.Mesh[];
  resultMesh?: THREE.Mesh;
}

export interface FixtureNegative {
  id: string;
  operation: CSGOperation;
  removalDirection: THREE.Vector3;
  parameters: {
    depth: number;
    angle: number;
    offset: number;
  };
}

export class CSGEngine {
  private evaluator: Evaluator;

  constructor() {
    this.evaluator = new Evaluator();
  }

  // Ensure geometry has a uv attribute so three-bvh-csg operations that expect UVs do not fail.
  // For imported meshes (e.g. STL) that lack UVs, we create a dummy zeroed uv buffer. This is
  // sufficient for boolean operations where we are not relying on texture coordinates.
  private ensureUVs(geometry: THREE.BufferGeometry): void {
    if (geometry.getAttribute('uv')) {
      return;
    }

    const position = geometry.getAttribute('position') as THREE.BufferAttribute | undefined;
    if (!position) {
      return;
    }

    const uvArray = new Float32Array(position.count * 2);
    geometry.setAttribute('uv', new THREE.BufferAttribute(uvArray, 2));
  }

  private cloneWorldGeometry(mesh: THREE.Mesh): THREE.BufferGeometry {
    const geo = mesh.geometry.clone();
    const m = mesh.matrixWorld.clone();
    geo.applyMatrix4(m);
    this.ensureUVs(geo);
    return geo;
  }

  private inflateGeometry(geometry: THREE.BufferGeometry, offset: number): THREE.BufferGeometry {
    if (!offset) return geometry;
    const geo = geometry.clone();
    geo.computeVertexNormals();
    const pos = geo.getAttribute('position') as THREE.BufferAttribute;
    const nor = geo.getAttribute('normal') as THREE.BufferAttribute;
    const arr = pos.array as Float32Array;
    const nArr = nor.array as Float32Array;
    for (let i = 0; i < pos.count; i++) {
      const ix = i * 3;
      arr[ix] += nArr[ix] * offset;
      arr[ix + 1] += nArr[ix + 1] * offset;
      arr[ix + 2] += nArr[ix + 2] * offset;
    }
    pos.needsUpdate = true;
    geo.computeVertexNormals();
    geo.computeBoundingBox();
    geo.computeBoundingSphere();
    return geo;
  }

  // Compute a scale-aware, clamped offset based on tool bounds and user-provided offset
  private computeEffectiveOffset(geometry: THREE.BufferGeometry, userOffset: number): number {
    if (!userOffset) {
      return 0;
    }

    const box = geometry.boundingBox ? geometry.boundingBox.clone() : new THREE.Box3().setFromBufferAttribute(geometry.getAttribute('position') as THREE.BufferAttribute);
    const size = box.getSize(new THREE.Vector3());
    const longestEdge = Math.max(size.x, size.y, size.z) || 1;

    // Numerical epsilon to avoid coincident surfaces
    const epsilon = 0.01; // 10 microns
    // Limit offset to a small fraction of the tool size to avoid extreme inflation
    const maxMagnitude = Math.max(longestEdge * 0.02, epsilon); // at most 2% of longest edge

    const raw = userOffset;
    if (raw > 0) {
      return Math.min(raw, maxMagnitude);
    }
    if (raw < 0) {
      return Math.max(raw, -maxMagnitude);
    }
    return 0;
  }

  // Build the set of brushes representing the swept volume for a single tool geometry.
  // We approximate the sweep by sampling multiple translated copies of the (inflated) tool
  // along the removal direction up to the specified depth. This is still an approximation,
  // but using several segments makes the subtraction much more precise than a single
  // start/end pair, while keeping the number of CSG evaluations bounded.
  private buildSweptBrushes(toolGeo: THREE.BufferGeometry, dir: THREE.Vector3, depth: number): Brush[] {
    const brushes: Brush[] = [];

    // Always normalize direction so depth is in mm units
    const nDir = dir.clone().normalize();

    // No sweep: just use the base tool
    if (depth <= 0) {
      brushes.push(new Brush(toolGeo));
      return brushes;
    }

    // Choose a small, bounded number of segments so we don't explode CSG cost.
    // With the local trim band (typically ~2 mm) even a coarser sampling still
    // produces a precise result while greatly reducing the amount of CSG work.
    const maxSegments = 8;
    const minSegmentLength = 0.5; // mm
    const approxSegments = Math.ceil(depth / minSegmentLength);
    const segments = Math.max(1, Math.min(maxSegments, approxSegments));

    for (let i = 0; i <= segments; i++) {
      const t = (depth * i) / segments;
      const sweep = toolGeo.clone();
      const shift = new THREE.Matrix4().makeTranslation(nDir.x * t, nDir.y * t, nDir.z * t);
      sweep.applyMatrix4(shift);
      brushes.push(new Brush(sweep));
    }

    return brushes;
  }

  /**
   * Create a negative space by subtracting fixture components from the base part
   */
  createNegativeSpace(
    baseMesh: THREE.Mesh,
    fixtureComponents: THREE.Mesh[],
    removalDirection: THREE.Vector3 = new THREE.Vector3(0, -1, 0),
    options: {
      depth?: number;
      angle?: number;
      offset?: number;
    } = {}
  ): THREE.Mesh {
    const {
      depth = 10,
      angle: _angle = 0,
      offset = 0
    } = options;
    void _angle; // Angle reserved for future draft angle implementation
    // If there are no fixture components, just return a clone of the base mesh
    if (!fixtureComponents || fixtureComponents.length === 0) {
      return baseMesh.clone();
    }

    const dir = removalDirection.clone().normalize();

    const baseWorld = baseMesh.matrixWorld.clone();
    const baseWorldInv = baseWorld.clone().invert();
    const baseGeoWorld = this.cloneWorldGeometry(baseMesh);
    const baseBrush = new Brush(baseGeoWorld);

    const toolWorldGeometries: THREE.BufferGeometry[] = fixtureComponents.map((m) => this.cloneWorldGeometry(m));
    const inflatedTools = toolWorldGeometries.map((g) => {
      const effOffset = this.computeEffectiveOffset(g, offset);
      return this.inflateGeometry(g, effOffset);
    });

    let resultBrush = baseBrush;

    try {
      inflatedTools.forEach((toolGeo) => {
        const brushes = this.buildSweptBrushes(toolGeo, dir, depth);
        brushes.forEach((b) => {
          resultBrush = this.evaluator.evaluate(resultBrush, b, SUBTRACTION);
        });
      });
    } catch (error) {
      console.error('CSGEngine.createNegativeSpace failed, returning original base mesh:', error);
      return baseMesh.clone();
    }

    const resultGeometryWorld = resultBrush.geometry;
    resultGeometryWorld.applyMatrix4(baseWorldInv);
    resultGeometryWorld.computeVertexNormals();
    resultGeometryWorld.computeBoundingBox();
    resultGeometryWorld.computeBoundingSphere();

    const mat = Array.isArray(baseMesh.material) ? baseMesh.material[0] : baseMesh.material;
    const resultMesh = new THREE.Mesh(resultGeometryWorld, mat?.clone());
    resultMesh.position.copy(baseMesh.position);
    resultMesh.rotation.copy(baseMesh.rotation as THREE.Euler);
    resultMesh.scale.copy(baseMesh.scale as THREE.Vector3);
    resultMesh.updateMatrixWorld(true);

    return resultMesh;
  }

  /**
   * Create a pocket/hole in the base mesh
   */
  createPocket(
    baseMesh: THREE.Mesh,
    pocketShape: THREE.BufferGeometry,
    position: THREE.Vector3,
    _depth: number = 5,
    direction: THREE.Vector3 = new THREE.Vector3(0, -1, 0)
  ): THREE.Mesh {
    void _depth; // depth parameter reserved for future use
    // Create pocket brush
    const pocketGeo = pocketShape.clone();
    this.ensureUVs(pocketGeo);
    const pocketBrush = new Brush(pocketGeo);

    // Position the pocket
    const matrix = new THREE.Matrix4();
    matrix.setPosition(position);
    matrix.multiply(new THREE.Matrix4().makeRotationFromEuler(
      new THREE.Euler(
        Math.atan2(direction.z, direction.y),
        Math.atan2(direction.x, direction.y),
        0
      )
    ));
    pocketBrush.applyMatrix4(matrix);

    // Create base brush
    const baseGeo = baseMesh.geometry.clone();
    this.ensureUVs(baseGeo);
    const baseBrush = new Brush(baseGeo);

    // Perform subtraction
    const resultBrush = this.evaluator.evaluate(baseBrush, pocketBrush, SUBTRACTION);

    // Convert to mesh
    const resultGeometry = resultBrush.geometry;
    const pocketMat = Array.isArray(baseMesh.material) ? baseMesh.material[0] : baseMesh.material;
    const resultMesh = new THREE.Mesh(resultGeometry, pocketMat?.clone());

    return resultMesh;
  }

  /**
   * Create a chamfer or bevel on edges
   */
  createChamfer(
    baseMesh: THREE.Mesh,
    chamferSize: number = 2,
    _chamferAngle: number = 45
  ): THREE.Mesh {
    void _chamferAngle; // Reserved for future chamfer angle implementation
    // This is a simplified chamfer implementation
    // In a real implementation, you'd detect edges and create chamfer geometry

    const baseBrush = new Brush(baseMesh.geometry.clone());

    // Create a slightly smaller version offset inward
    const offsetGeometry = this.createOffsetGeometry(baseMesh.geometry, -chamferSize);
    if (offsetGeometry) {
      const offsetBrush = new Brush(offsetGeometry);
      const resultBrush = this.evaluator.evaluate(baseBrush, offsetBrush, SUBTRACTION);

      const resultGeometry = resultBrush.geometry;
      const chamferMat = Array.isArray(baseMesh.material) ? baseMesh.material[0] : baseMesh.material;
      const resultMesh = new THREE.Mesh(resultGeometry, chamferMat?.clone());

      return resultMesh;
    }

    return baseMesh.clone();
  }

  /**
   * Create a fillet (rounded edge)
   */
  createFillet(
    baseMesh: THREE.Mesh,
    _filletRadius: number = 2
  ): THREE.Mesh {
    void _filletRadius; // Reserved for future fillet implementation
    // This would require more complex geometry processing
    // For now, return the original mesh
    console.warn('Fillet creation not yet implemented');
    return baseMesh.clone();
  }

  /**
   * Create an offset geometry (shell operation)
   */
  createOffsetGeometry(_geometry: THREE.BufferGeometry, _offset: number): THREE.BufferGeometry | null {
    void _geometry;
    void _offset;
    // This is a placeholder for offset geometry creation
    // In a real implementation, you'd use a proper offset algorithm
    console.warn('Offset geometry creation not yet implemented');
    return null;
  }

  /**
   * Validate that a CSG operation will produce a valid result
   */
  validateOperation(baseMesh: THREE.Mesh, toolMeshes: THREE.Mesh[]): boolean {
    try {
      // Check if meshes have valid geometry
      if (!baseMesh.geometry || baseMesh.geometry.attributes.position.count === 0) {
        return false;
      }

      for (const toolMesh of toolMeshes) {
        if (!toolMesh.geometry || toolMesh.geometry.attributes.position.count === 0) {
          return false;
        }
      }

      // Check if tool meshes intersect with base mesh
      const baseBox = new THREE.Box3().setFromObject(baseMesh);
      const hasIntersection = toolMeshes.some(toolMesh => {
        const toolBox = new THREE.Box3().setFromObject(toolMesh);
        return baseBox.intersectsBox(toolBox);
      });

      return hasIntersection;
    } catch (error) {
      console.error('Error validating CSG operation:', error);
      return false;
    }
  }

  /**
   * Optimize geometry after CSG operations
   */
  optimizeGeometry(mesh: THREE.Mesh): THREE.Mesh {
    // Note: mergeVertices requires BufferGeometryUtils import
    // For now, skip merging - can be added if needed

    // Remove duplicate faces
    mesh.geometry = this.removeDuplicateFaces(mesh.geometry);

    // Compute normals
    mesh.geometry.computeVertexNormals();
    mesh.geometry.computeBoundingBox();
    mesh.geometry.computeBoundingSphere();

    return mesh;
  }

  /**
   * Remove duplicate faces from geometry
   */
  private removeDuplicateFaces(geometry: THREE.BufferGeometry): THREE.BufferGeometry {
    // This is a simplified implementation
    // In a real implementation, you'd properly detect and remove duplicate faces
    return geometry;
  }

  /**
   * Create a cutting plane for sectioning
   */
  createCuttingPlane(
    baseMesh: THREE.Mesh,
    planeNormal: THREE.Vector3,
    planePoint: THREE.Vector3
  ): THREE.Mesh {
    const baseBrush = new Brush(baseMesh.geometry.clone());

    // Create cutting plane
    const planeGeometry = new THREE.PlaneGeometry(1000, 1000);
    const plane = new THREE.Mesh(planeGeometry);
    plane.position.copy(planePoint);
    plane.lookAt(planePoint.clone().add(planeNormal));

    const planeBrush = new Brush(plane.geometry);

    // Perform intersection to create section
    const resultBrush = this.evaluator.evaluate(baseBrush, planeBrush, SUBTRACTION);

    const resultGeometry = resultBrush.geometry;
    const cutMat = Array.isArray(baseMesh.material) ? baseMesh.material[0] : baseMesh.material;
    const resultMesh = new THREE.Mesh(resultGeometry, cutMat?.clone());

    return resultMesh;
  }
}

// Utility functions for common operations
export const csgUtils = {
  /**
   * Create a cylindrical hole
   */
  createCylindricalHole(
    baseMesh: THREE.Mesh,
    radius: number,
    depth: number,
    position: THREE.Vector3,
    direction: THREE.Vector3 = new THREE.Vector3(0, -1, 0)
  ): THREE.Mesh {
    const engine = new CSGEngine();
    const holeGeometry = new THREE.CylinderGeometry(radius, radius, depth, 16);
    return engine.createPocket(baseMesh, holeGeometry, position, depth, direction);
  },

  /**
   * Create a rectangular pocket
   */
  createRectangularPocket(
    baseMesh: THREE.Mesh,
    width: number,
    length: number,
    depth: number,
    position: THREE.Vector3,
    rotation: THREE.Euler = new THREE.Euler()
  ): THREE.Mesh {
    const engine = new CSGEngine();
    const pocketGeometry = new THREE.BoxGeometry(width, depth, length);

    // Apply rotation
    pocketGeometry.rotateX(rotation.x);
    pocketGeometry.rotateY(rotation.y);
    pocketGeometry.rotateZ(rotation.z);

    return engine.createPocket(baseMesh, pocketGeometry, position, depth);
  },

  /**
   * Create a counterbore hole
   */
  createCounterboreHole(
    baseMesh: THREE.Mesh,
    holeRadius: number,
    counterboreRadius: number,
    holeDepth: number,
    counterboreDepth: number,
    position: THREE.Vector3
  ): THREE.Mesh {
    const engine = new CSGEngine();

    // Create counterbore
    const counterboreGeometry = new THREE.CylinderGeometry(counterboreRadius, counterboreRadius, counterboreDepth, 16);
    let resultMesh = engine.createPocket(baseMesh, counterboreGeometry, position, counterboreDepth);

    // Create through hole
    const holeGeometry = new THREE.CylinderGeometry(holeRadius, holeRadius, holeDepth, 16);
    resultMesh = engine.createPocket(resultMesh, holeGeometry, position, holeDepth);

    return resultMesh;
  },

  /**
   * Create a countersink hole
   */
  createCountersinkHole(
    baseMesh: THREE.Mesh,
    holeRadius: number,
    countersinkRadius: number,
    holeDepth: number,
    countersinkAngle: number,
    position: THREE.Vector3
  ): THREE.Mesh {
    const engine = new CSGEngine();

    // Create countersink (conical shape)
    const countersinkHeight = (countersinkRadius - holeRadius) / Math.tan(countersinkAngle * Math.PI / 180);
    const countersinkGeometry = new THREE.ConeGeometry(countersinkRadius, countersinkHeight, 16);
    let resultMesh = engine.createPocket(baseMesh, countersinkGeometry, position, countersinkHeight);

    // Create through hole
    const holeGeometry = new THREE.CylinderGeometry(holeRadius, holeRadius, holeDepth, 16);
    resultMesh = engine.createPocket(resultMesh, holeGeometry, position, holeDepth);

    return resultMesh;
  }
};
