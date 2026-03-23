import * as THREE from 'three';

export interface SnapPoint {
  position: THREE.Vector3;
  type: 'grid' | 'edge' | 'face' | 'vertex' | 'center';
  object?: THREE.Object3D;
  normal?: THREE.Vector3;
}

export interface SnapResult {
  position: THREE.Vector3;
  snapped: boolean;
  snapPoint?: SnapPoint;
  distance: number;
}

export class SnappingSystem {
  private gridSize: number;
  private snapDistance: number;
  private snapPoints: SnapPoint[] = [];
  private sceneObjects: THREE.Object3D[] = [];

  constructor(gridSize: number = 5, snapDistance: number = 0.5) {
    this.gridSize = gridSize;
    this.snapDistance = snapDistance;
  }

  /**
   * Update the list of objects in the scene for snapping
   */
  updateSceneObjects(objects: THREE.Object3D[]) {
    this.sceneObjects = objects;
    this.generateSnapPoints();
  }

  /**
   * Generate snap points from all objects in the scene
   */
  private generateSnapPoints() {
    this.snapPoints = [];

    this.sceneObjects.forEach(obj => {
      this.generateObjectSnapPoints(obj);
    });

    // Add grid snap points around the cursor area
    this.generateGridSnapPoints();
  }

  /**
   * Generate snap points for a specific object
   */
  private generateObjectSnapPoints(object: THREE.Object3D) {
    // Skip objects without geometry (groups, lights, etc.)
    if (!(object as THREE.Mesh).geometry) return;

    const worldPosition = new THREE.Vector3();
    object.getWorldPosition(worldPosition);

    const boundingBox = new THREE.Box3().setFromObject(object);
    const center = boundingBox.getCenter(new THREE.Vector3());

    // Add vertex snap points
    this.addVertexSnapPoints(object, boundingBox);

    // Add edge snap points
    this.addEdgeSnapPoints(object, boundingBox);

    // Add face center snap points
    this.addFaceSnapPoints(object, boundingBox);

    // Add object center snap point
    this.snapPoints.push({
      position: center.clone(),
      type: 'center',
      object: object
    });
  }

  /**
   * Add vertex snap points for an object's bounding box
   */
  private addVertexSnapPoints(object: THREE.Object3D, boundingBox: THREE.Box3) {
    const vertices = [
      boundingBox.min,
      boundingBox.max,
      new THREE.Vector3(boundingBox.min.x, boundingBox.min.y, boundingBox.max.z),
      new THREE.Vector3(boundingBox.min.x, boundingBox.max.y, boundingBox.min.z),
      new THREE.Vector3(boundingBox.max.x, boundingBox.min.y, boundingBox.min.z),
      new THREE.Vector3(boundingBox.min.x, boundingBox.max.y, boundingBox.max.z),
      new THREE.Vector3(boundingBox.max.x, boundingBox.min.y, boundingBox.max.z),
      new THREE.Vector3(boundingBox.max.x, boundingBox.max.y, boundingBox.min.z)
    ];

    vertices.forEach(vertex => {
      this.snapPoints.push({
        position: vertex.clone(),
        type: 'vertex',
        object: object
      });
    });
  }

  /**
   * Add edge midpoint snap points
   */
  private addEdgeSnapPoints(object: THREE.Object3D, boundingBox: THREE.Box3) {
    const edges = [
      // Bottom face edges
      [boundingBox.min, new THREE.Vector3(boundingBox.max.x, boundingBox.min.y, boundingBox.min.z)],
      [boundingBox.min, new THREE.Vector3(boundingBox.min.x, boundingBox.max.y, boundingBox.min.z)],
      [boundingBox.max, new THREE.Vector3(boundingBox.min.x, boundingBox.max.y, boundingBox.max.z)],
      [boundingBox.max, new THREE.Vector3(boundingBox.max.x, boundingBox.min.y, boundingBox.max.z)],

      // Top face edges
      [new THREE.Vector3(boundingBox.min.x, boundingBox.max.y, boundingBox.min.z), boundingBox.max],
      [new THREE.Vector3(boundingBox.max.x, boundingBox.min.y, boundingBox.min.z), boundingBox.max],
      [new THREE.Vector3(boundingBox.min.x, boundingBox.min.y, boundingBox.max.z), boundingBox.max],
      [new THREE.Vector3(boundingBox.min.x, boundingBox.max.y, boundingBox.max.z), boundingBox.max],

      // Vertical edges
      [boundingBox.min, new THREE.Vector3(boundingBox.min.x, boundingBox.max.y, boundingBox.max.z)],
      [new THREE.Vector3(boundingBox.max.x, boundingBox.min.y, boundingBox.min.z), new THREE.Vector3(boundingBox.max.x, boundingBox.max.y, boundingBox.max.z)],
      [new THREE.Vector3(boundingBox.min.x, boundingBox.min.y, boundingBox.max.z), new THREE.Vector3(boundingBox.min.x, boundingBox.max.y, boundingBox.min.z)],
      [new THREE.Vector3(boundingBox.max.x, boundingBox.min.y, boundingBox.max.z), new THREE.Vector3(boundingBox.max.x, boundingBox.max.y, boundingBox.min.z)]
    ];

    edges.forEach(([start, end]) => {
      const midpoint = start.clone().add(end).multiplyScalar(0.5);
      this.snapPoints.push({
        position: midpoint,
        type: 'edge',
        object: object
      });
    });
  }

  /**
   * Add face center snap points
   */
  private addFaceSnapPoints(object: THREE.Object3D, boundingBox: THREE.Box3) {
    const faces = [
      // Front, back, left, right, top, bottom faces
      new THREE.Vector3(0, 0, 1), // front
      new THREE.Vector3(0, 0, -1), // back
      new THREE.Vector3(-1, 0, 0), // left
      new THREE.Vector3(1, 0, 0), // right
      new THREE.Vector3(0, 1, 0), // top
      new THREE.Vector3(0, -1, 0) // bottom
    ];

    faces.forEach(normal => {
      const faceCenter = boundingBox.getCenter(new THREE.Vector3()).add(
        normal.clone().multiplyScalar(boundingBox.getSize(new THREE.Vector3()).length() / 2)
      );

      this.snapPoints.push({
        position: faceCenter,
        type: 'face',
        object: object,
        normal: normal
      });
    });
  }

  /**
   * Generate grid snap points around a specific area
   */
  private generateGridSnapPoints(center: THREE.Vector3 = new THREE.Vector3(0, 0, 0), radius: number = 20) {
    const halfGrid = Math.ceil(radius / this.gridSize);

    for (let x = -halfGrid; x <= halfGrid; x++) {
      for (let y = -halfGrid; y <= halfGrid; y++) {
        for (let z = -halfGrid; z <= halfGrid; z++) {
          const position = new THREE.Vector3(
            Math.round(center.x / this.gridSize) * this.gridSize + x * this.gridSize,
            Math.round(center.y / this.gridSize) * this.gridSize + y * this.gridSize,
            Math.round(center.z / this.gridSize) * this.gridSize + z * this.gridSize
          );

          // Only add if within radius
          if (position.distanceTo(center) <= radius) {
            this.snapPoints.push({
              position: position,
              type: 'grid'
            });
          }
        }
      }
    }
  }

  /**
   * Find the closest snap point to a given position
   */
  findClosestSnap(position: THREE.Vector3, maxDistance: number = this.snapDistance): SnapResult {
    let closestSnap: SnapPoint | null = null;
    let closestDistance = Infinity;

    for (const snapPoint of this.snapPoints) {
      const distance = position.distanceTo(snapPoint.position);

      if (distance <= maxDistance && distance < closestDistance) {
        closestDistance = distance;
        closestSnap = snapPoint;
      }
    }

    if (closestSnap) {
      return {
        position: closestSnap.position.clone(),
        snapped: true,
        snapPoint: closestSnap,
        distance: closestDistance
      };
    }

    return {
      position: position.clone(),
      snapped: false,
      distance: 0
    };
  }

  /**
   * Get snap points within a certain radius for visualization
   */
  getSnapPointsInRadius(center: THREE.Vector3, radius: number): SnapPoint[] {
    return this.snapPoints.filter(point =>
      point.position.distanceTo(center) <= radius
    );
  }

  /**
   * Update grid size
   */
  setGridSize(size: number) {
    this.gridSize = size;
    this.generateSnapPoints();
  }

  /**
   * Update snap distance threshold
   */
  setSnapDistance(distance: number) {
    this.snapDistance = distance;
  }

  /**
   * Clear all snap points
   */
  clear() {
    this.snapPoints = [];
    this.sceneObjects = [];
  }
}
