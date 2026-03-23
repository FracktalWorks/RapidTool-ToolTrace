import * as THREE from 'three';

export interface CADOperationResult {
  success: boolean;
  mesh?: THREE.Mesh;
  error?: string;
}

export interface TransformationParams {
  scale?: { x: number; y: number; z: number };
  rotation?: { x: number; y: number; z: number };
  translation?: { x: number; y: number; z: number };
}

export interface BooleanParams {
  operation: 'union' | 'subtract' | 'intersect';
  mesh1: THREE.Mesh;
  mesh2: THREE.Mesh;
}

export class CADOperations {
  /**
   * Apply transformations to a mesh
   */
  applyTransformation(mesh: THREE.Mesh, params: TransformationParams): CADOperationResult {
    try {
      const geometry = mesh.geometry.clone();

      // Apply scaling
      if (params.scale) {
        geometry.scale(params.scale.x, params.scale.y, params.scale.z);
      }

      // Apply rotation (convert degrees to radians)
      if (params.rotation) {
        geometry.rotateX((params.rotation.x || 0) * Math.PI / 180);
        geometry.rotateY((params.rotation.y || 0) * Math.PI / 180);
        geometry.rotateZ((params.rotation.z || 0) * Math.PI / 180);
      }

      // Apply translation
      if (params.translation) {
        geometry.translate(
          params.translation.x || 0,
          params.translation.y || 0,
          params.translation.z || 0
        );
      }

      const mat = Array.isArray(mesh.material) ? mesh.material[0] : mesh.material;
      const newMesh = new THREE.Mesh(geometry, mat?.clone());
      return { success: true, mesh: newMesh };
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
    }
  }

  /**
   * Perform boolean operations between two meshes (simplified for now)
   * TODO: Implement proper CSG operations when three-csg is available
   */
  performBooleanOperation(params: BooleanParams): CADOperationResult {
    try {
      // For now, return the first mesh as a placeholder
      // In a full implementation, this would use proper CSG operations
      console.warn('Boolean operations not fully implemented yet - using mesh1 as result');

      const resultMesh = params.mesh1.clone();
      return { success: true, mesh: resultMesh };
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
    }
  }

  /**
   * Create a box mesh
   */
  createBox(width: number, height: number, depth: number): THREE.Mesh {
    const geometry = new THREE.BoxGeometry(width, height, depth);
    const material = new THREE.MeshStandardMaterial({
      color: 0x888888,
      roughness: 0.6,
      metalness: 0.1
    });
    return new THREE.Mesh(geometry, material);
  }

  /**
   * Create a cylinder mesh
   */
  createCylinder(radius: number, height: number): THREE.Mesh {
    const geometry = new THREE.CylinderGeometry(radius, radius, height);
    const material = new THREE.MeshStandardMaterial({
      color: 0x888888,
      roughness: 0.6,
      metalness: 0.1
    });
    return new THREE.Mesh(geometry, material);
  }

  /**
   * Create a sphere mesh
   */
  createSphere(radius: number): THREE.Mesh {
    const geometry = new THREE.SphereGeometry(radius);
    const material = new THREE.MeshStandardMaterial({
      color: 0x888888,
      roughness: 0.6,
      metalness: 0.1
    });
    return new THREE.Mesh(geometry, material);
  }
}
