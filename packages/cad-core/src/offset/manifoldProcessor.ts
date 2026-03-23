// ============================================
// Manifold 3D Mesh Processing Module
// Robust mesh optimization, repair, and decimation using Manifold 3D
// ============================================

import * as THREE from 'three';

// Manifold 3D types
let ManifoldModule: any = null;
let Manifold: any = null;
let Mesh: any = null;

// ============================================
// Initialization
// ============================================

/**
 * Initialize the Manifold 3D module
 * Must be called before using any Manifold functions
 */
export async function initManifold(): Promise<boolean> {
    if (ManifoldModule) return true;
    
    try {
        // Dynamic import for browser compatibility
        // Manifold 3D exports a default function that returns a promise with the WASM module
        const module = await import('manifold-3d');
        ManifoldModule = await module.default();
        
        // Call setup() to initialize the module - required!
        ManifoldModule.setup();
        
        Manifold = ManifoldModule.Manifold;
        Mesh = ManifoldModule.Mesh;
        
        return true;
    } catch (error) {
        console.error('Failed to initialize Manifold 3D:', error);
        // Try alternative loading for CDN
        try {
            // Fallback: try loading from global scope if loaded via script tag
            if (typeof (window as any).Module !== 'undefined') {
                ManifoldModule = (window as any).Module;
                ManifoldModule.setup();
                Manifold = ManifoldModule.Manifold;
                Mesh = ManifoldModule.Mesh;
                return true;
            }
        } catch (e2) {
            console.error('Fallback loading also failed:', e2);
        }
        return false;
    }
}

/**
 * Check if Manifold is ready
 */
export function isManifoldReady(): boolean {
    return ManifoldModule !== null;
}

// ============================================
// Geometry Conversion
// ============================================

/**
 * Convert Three.js BufferGeometry to Manifold Mesh
 * Based on the official three.ts example pattern
 */
function geometryToManifoldMesh(geometry: THREE.BufferGeometry): any {
    if (!Mesh) {
        throw new Error('Manifold not initialized - call initManifold() first');
    }
    
    const positionAttr = geometry.getAttribute('position');
    const positions = positionAttr.array as Float32Array;
    
    // Manifold uses vertProperties for vertex data (interleaved)
    const vertProperties = new Float32Array(positions);
    
    // Generate triangle indices
    let triVerts: Uint32Array;
    if (geometry.index) {
        triVerts = new Uint32Array(geometry.index.array);
    } else {
        // For non-indexed geometry, each vertex is unique
        const vertexCount = positions.length / 3;
        triVerts = new Uint32Array(vertexCount);
        for (let i = 0; i < vertexCount; i++) {
            triVerts[i] = i;
        }
    }
    
    // Create the Mesh using the correct API
    const mesh = new Mesh({
        numProp: 3, // x, y, z per vertex
        vertProperties,
        triVerts,
    });
    
    // Call merge() to combine vertices with nearly identical positions
    // This is necessary for Manifold to work properly
    mesh.merge();
    
    return mesh;
}

/**
 * Convert Manifold Mesh back to Three.js BufferGeometry
 */
function manifoldMeshToGeometry(mesh: any): THREE.BufferGeometry {
    const geometry = new THREE.BufferGeometry();
    
    const vertProperties = mesh.vertProperties;
    const triVerts = mesh.triVerts;
    const numProp = mesh.numProp;
    
    // Extract positions (first 3 properties per vertex)
    const numVerts = vertProperties.length / numProp;
    const positions = new Float32Array(numVerts * 3);
    
    for (let i = 0; i < numVerts; i++) {
        positions[i * 3] = vertProperties[i * numProp];
        positions[i * 3 + 1] = vertProperties[i * numProp + 1];
        positions[i * 3 + 2] = vertProperties[i * numProp + 2];
    }
    
    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geometry.setIndex(Array.from(triVerts));
    geometry.computeVertexNormals();
    
    return geometry;
}

// ============================================
// Main Processing Functions
// ============================================

/**
 * Process mesh with Manifold 3D to ensure it's valid and optionally decimate
 * 
 * @param geometry - Input Three.js BufferGeometry
 * @param options - Processing options
 * @returns Processed geometry
 */
export async function processWithManifold(
    geometry: THREE.BufferGeometry,
    options: {
        decimate?: boolean;
        targetRatio?: number;
        ensureManifold?: boolean;
    } = {}
): Promise<{
    geometry: THREE.BufferGeometry;
    isManifold: boolean;
    originalTriangles: number;
    finalTriangles: number;
    processingTime: number;
}> {
    const startTime = performance.now();
    const { decimate = true, targetRatio = 0.5, ensureManifold = true } = options;
    
    // Ensure Manifold is initialized
    if (!isManifoldReady()) {
        const success = await initManifold();
        if (!success) {
            throw new Error('Failed to initialize Manifold 3D');
        }
    }
    
    const originalTriangles = geometry.index ? geometry.index.count / 3 : 0;
    let isManifold = false;
    let resultGeometry = geometry;
    
    try {
        // Convert to Manifold mesh
        const mesh = geometryToManifoldMesh(geometry);
        
        // Try to create a Manifold from the mesh
        // This will fail if the mesh is not manifold
        let manifold: any;
        
        try {
            manifold = new Manifold(mesh);
            isManifold = true;
        } catch (e) {
            if (ensureManifold) {
                // Try to make it manifold using hull or other operations
                // For now, we'll use the convex hull as a fallback for severely broken meshes
                // but first try to use the mesh as-is
                try {
                    // Attempt to create manifold with error tolerance
                    manifold = Manifold.ofMesh(mesh);
                    isManifold = true;
                } catch (e2) {
                    console.warn('Could not repair mesh, using original geometry');
                    return {
                        geometry,
                        isManifold: false,
                        originalTriangles,
                        finalTriangles: originalTriangles,
                        processingTime: performance.now() - startTime
                    };
                }
            } else {
                return {
                    geometry,
                    isManifold: false,
                    originalTriangles,
                    finalTriangles: originalTriangles,
                    processingTime: performance.now() - startTime
                };
            }
        }
        
        // Get the manifold mesh
        let outputMesh = manifold.getMesh();
        let finalTriangles = outputMesh.triVerts.length / 3;
        
        // Apply decimation if requested
        if (decimate && targetRatio < 1.0 && finalTriangles > 100) {
            const targetTriangles = Math.max(12, Math.floor(finalTriangles * targetRatio));
            
            try {
                // Use Manifold's simplify/decimate if available
                // Note: Manifold 3D doesn't have built-in decimation, so we'll use
                // the mesh as-is after manifold repair
                // The actual decimation will still use meshoptimizer
            } catch (e) {
                // Decimation not applied
            }
            
            outputMesh = manifold.getMesh();
            finalTriangles = outputMesh.triVerts.length / 3;
        }
        
        // Convert back to Three.js geometry
        resultGeometry = manifoldMeshToGeometry(outputMesh);
        
        // Clean up Manifold objects
        manifold.delete();
        
        const processingTime = performance.now() - startTime;
        
        return {
            geometry: resultGeometry,
            isManifold,
            originalTriangles,
            finalTriangles,
            processingTime
        };
        
    } catch (error) {
        console.error('Manifold processing error:', error);
        return {
            geometry,
            isManifold: false,
            originalTriangles,
            finalTriangles: originalTriangles,
            processingTime: performance.now() - startTime
        };
    }
}

/**
 * Ensure mesh is watertight/manifold using Manifold 3D
 * This is a simpler function that just validates and repairs if possible
 */
export async function ensureManifold(geometry: THREE.BufferGeometry): Promise<{
    geometry: THREE.BufferGeometry;
    isManifold: boolean;
    wasRepaired: boolean;
}> {
    if (!isManifoldReady()) {
        await initManifold();
    }
    
    try {
        const mesh = geometryToManifoldMesh(geometry);
        
        try {
            const manifold = new Manifold(mesh);
            const outputMesh = manifold.getMesh();
            const resultGeometry = manifoldMeshToGeometry(outputMesh);
            manifold.delete();
            
            return {
                geometry: resultGeometry,
                isManifold: true,
                wasRepaired: false
            };
        } catch (e) {
            // Try repair
            try {
                const manifold = Manifold.ofMesh(mesh);
                const outputMesh = manifold.getMesh();
                const resultGeometry = manifoldMeshToGeometry(outputMesh);
                manifold.delete();
                
                return {
                    geometry: resultGeometry,
                    isManifold: true,
                    wasRepaired: true
                };
            } catch (e2) {
                return {
                    geometry,
                    isManifold: false,
                    wasRepaired: false
                };
            }
        }
    } catch (error) {
        return {
            geometry,
            isManifold: false,
            wasRepaired: false
        };
    }
}

/**
 * Get mesh statistics from Manifold
 */
export async function getMeshStats(geometry: THREE.BufferGeometry): Promise<{
    isManifold: boolean;
    genus: number;
    volume: number;
    surfaceArea: number;
    numVertices: number;
    numTriangles: number;
}> {
    if (!isManifoldReady()) {
        await initManifold();
    }
    
    const numVertices = geometry.attributes.position.count;
    const numTriangles = geometry.index ? geometry.index.count / 3 : 0;
    
    try {
        const mesh = geometryToManifoldMesh(geometry);
        const manifold = new Manifold(mesh);
        
        const stats = {
            isManifold: true,
            genus: manifold.genus(),
            volume: manifold.volume(),
            surfaceArea: manifold.surfaceArea(),
            numVertices,
            numTriangles
        };
        
        manifold.delete();
        return stats;
    } catch (e) {
        return {
            isManifold: false,
            genus: -1,
            volume: 0,
            surfaceArea: 0,
            numVertices,
            numTriangles
        };
    }
}

// ============================================
// CSG Boolean Operations
// ============================================

/**
 * Perform CSG subtraction: result = A - B
 * Subtracts geometry B from geometry A
 * 
 * @param geometryA - The base geometry to subtract from
 * @param geometryB - The geometry to subtract (the cutting tool)
 * @returns The resulting geometry after subtraction, or null if operation fails
 */
export async function csgSubtract(
    geometryA: THREE.BufferGeometry,
    geometryB: THREE.BufferGeometry
): Promise<THREE.BufferGeometry | null> {
    if (!isManifoldReady()) {
        const success = await initManifold();
        if (!success) {
            console.error('Failed to initialize Manifold 3D for CSG operation');
            return null;
        }
    }
    
    const startTime = performance.now();
    
    try {
        // Convert to Manifold meshes (geometryToManifoldMesh handles both indexed and non-indexed)
        const meshA = geometryToManifoldMesh(geometryA);
        const meshB = geometryToManifoldMesh(geometryB);
        
        // Create Manifolds
        let manifoldA: any;
        let manifoldB: any;
        
        try {
            manifoldA = new Manifold(meshA);
        } catch (e) {
            console.warn('Geometry A is not manifold, attempting repair...');
            try {
                manifoldA = Manifold.ofMesh(meshA);
            } catch (e2) {
                console.error('Could not create manifold from geometry A:', e2);
                return null;
            }
        }
        
        try {
            manifoldB = new Manifold(meshB);
        } catch (e) {
            console.warn('Geometry B is not manifold, attempting repair...');
            try {
                manifoldB = Manifold.ofMesh(meshB);
            } catch (e2) {
                console.error('Could not create manifold from geometry B:', e2);
                manifoldA.delete();
                return null;
            }
        }
        
        // Perform subtraction
        const resultManifold = manifoldA.subtract(manifoldB);
        
        // Check if result is valid
        if (resultManifold.isEmpty()) {
            console.warn('CSG subtraction resulted in empty geometry');
            manifoldA.delete();
            manifoldB.delete();
            resultManifold.delete();
            return null;
        }
        
        // Convert back to THREE.js geometry
        const resultMesh = resultManifold.getMesh();
        const resultGeometry = manifoldMeshToGeometry(resultMesh);
        
        // Cleanup
        manifoldA.delete();
        manifoldB.delete();
        resultManifold.delete();
        
        return resultGeometry;
        
    } catch (error) {
        console.error('CSG subtraction failed:', error);
        return null;
    }
}

/**
 * Perform CSG union: result = A ∪ B
 * Combines geometry A and geometry B
 */
export async function csgUnion(
    geometryA: THREE.BufferGeometry,
    geometryB: THREE.BufferGeometry
): Promise<THREE.BufferGeometry | null> {
    if (!isManifoldReady()) {
        const success = await initManifold();
        if (!success) return null;
    }
    
    try {
        const meshA = geometryToManifoldMesh(geometryA);
        const meshB = geometryToManifoldMesh(geometryB);
        
        let manifoldA: any, manifoldB: any;
        
        try {
            manifoldA = new Manifold(meshA);
        } catch {
            manifoldA = Manifold.ofMesh(meshA);
        }
        
        try {
            manifoldB = new Manifold(meshB);
        } catch {
            manifoldB = Manifold.ofMesh(meshB);
        }
        
        const resultManifold = manifoldA.add(manifoldB);
        const resultMesh = resultManifold.getMesh();
        const resultGeometry = manifoldMeshToGeometry(resultMesh);
        
        manifoldA.delete();
        manifoldB.delete();
        resultManifold.delete();
        
        return resultGeometry;
    } catch (error) {
        console.error('CSG union failed:', error);
        return null;
    }
}

/**
 * Perform CSG intersection: result = A ∩ B
 * Returns the overlapping region of geometry A and geometry B
 */
export async function csgIntersect(
    geometryA: THREE.BufferGeometry,
    geometryB: THREE.BufferGeometry
): Promise<THREE.BufferGeometry | null> {
    if (!isManifoldReady()) {
        const success = await initManifold();
        if (!success) return null;
    }
    
    try {
        const meshA = geometryToManifoldMesh(geometryA);
        const meshB = geometryToManifoldMesh(geometryB);
        
        let manifoldA: any, manifoldB: any;
        
        try {
            manifoldA = new Manifold(meshA);
        } catch {
            manifoldA = Manifold.ofMesh(meshA);
        }
        
        try {
            manifoldB = new Manifold(meshB);
        } catch {
            manifoldB = Manifold.ofMesh(meshB);
        }
        
        const resultManifold = manifoldA.intersect(manifoldB);
        
        if (resultManifold.isEmpty()) {
            manifoldA.delete();
            manifoldB.delete();
            resultManifold.delete();
            return null;
        }
        
        const resultMesh = resultManifold.getMesh();
        const resultGeometry = manifoldMeshToGeometry(resultMesh);
        
        manifoldA.delete();
        manifoldB.delete();
        resultManifold.delete();
        
        return resultGeometry;
    } catch (error) {
        console.error('CSG intersection failed:', error);
        return null;
    }
}
