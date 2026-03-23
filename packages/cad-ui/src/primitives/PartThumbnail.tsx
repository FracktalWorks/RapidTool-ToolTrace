/**
 * PartThumbnail - 3D mesh thumbnail renderer
 * 
 * Renders a thumbnail preview of a THREE.js mesh using a shared WebGL renderer
 * to avoid hitting WebGL context limits.
 * 
 * @packageDocumentation
 * @module @rapidtool/cad-ui/primitives
 */

import React, { useRef, useEffect, useMemo } from 'react';
import * as THREE from 'three';

export interface PartThumbnailProps {
  /** The THREE.js mesh to render */
  mesh: THREE.Mesh;
  /** Size of the thumbnail in pixels */
  size?: number;
  /** Additional CSS class names */
  className?: string;
  /** Override color (hex string like '#4ade80') */
  color?: string;
  /** Background color (hex number) */
  backgroundColor?: number;
  /** Style object for the container */
  style?: React.CSSProperties;
}

// Default color palette for models
export const MODEL_COLOR_PALETTE = [
  '#4ade80', // Green
  '#f97316', // Orange
  '#06b6d4', // Cyan
  '#8b5cf6', // Purple
  '#ec4899', // Pink
  '#eab308', // Yellow
  '#ef4444', // Red
  '#22c55e', // Emerald
  '#3b82f6', // Blue
  '#f59e0b'  // Amber
] as const;

// Singleton shared renderer for all thumbnails to avoid WebGL context limit
let sharedRenderer: THREE.WebGLRenderer | null = null;
let sharedEnvMap: THREE.Texture | null = null;
let rendererRefCount = 0;

function getSharedRenderer(): THREE.WebGLRenderer {
  if (!sharedRenderer) {
    // Create offscreen canvas for shared rendering
    const offscreenCanvas = document.createElement('canvas');
    offscreenCanvas.width = 128;
    offscreenCanvas.height = 128;
    
    sharedRenderer = new THREE.WebGLRenderer({
      canvas: offscreenCanvas,
      antialias: true,
      alpha: false,
      powerPreference: 'high-performance',
      preserveDrawingBuffer: true,
    });
    sharedRenderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    sharedRenderer.setClearColor(0xffffff, 1);
    sharedRenderer.toneMapping = THREE.ACESFilmicToneMapping;
    sharedRenderer.toneMappingExposure = 1;
    sharedRenderer.outputColorSpace = THREE.SRGBColorSpace;
    
    // Create shared environment map
    sharedEnvMap = createWarehouseEnvMap(sharedRenderer);
  }
  rendererRefCount++;
  return sharedRenderer;
}

function releaseSharedRenderer(): void {
  rendererRefCount--;
  // Keep alive for reuse
}

// Create environment map for realistic lighting
function createWarehouseEnvMap(renderer: THREE.WebGLRenderer): THREE.Texture {
  const pmremGenerator = new THREE.PMREMGenerator(renderer);
  pmremGenerator.compileEquirectangularShader();
  
  const envScene = new THREE.Scene();
  
  const topColor = new THREE.Color(0xffffff);
  const middleColor = new THREE.Color(0xe8e8e8);
  const bottomColor = new THREE.Color(0xcccccc);
  
  const hemiLight = new THREE.HemisphereLight(topColor, bottomColor, 1.0);
  envScene.add(hemiLight);
  
  const ambient = new THREE.AmbientLight(middleColor, 0.5);
  envScene.add(ambient);
  
  const envMap = pmremGenerator.fromScene(envScene, 0.04).texture;
  pmremGenerator.dispose();
  
  return envMap;
}

/**
 * PartThumbnail component renders a 3D preview of a mesh
 */
export const PartThumbnail: React.FC<PartThumbnailProps> = ({ 
  mesh, 
  size = 24, 
  className = '', 
  color,
  backgroundColor = 0xffffff,
  style 
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const hasRenderedRef = useRef(false);

  // Determine the color to use
  const thumbnailColor = useMemo(() => {
    if (color) return color;
    
    if (mesh?.material) {
      const material = mesh.material as THREE.MeshStandardMaterial;
      if (material.color) {
        return '#' + material.color.getHexString();
      }
    }
    
    return MODEL_COLOR_PALETTE[0];
  }, [mesh, mesh?.material, color]);

  // Clone geometry and create material
  const thumbnailMesh = useMemo(() => {
    if (!mesh?.geometry) return null;
    
    const geometry = mesh.geometry.clone();
    const threeColor = new THREE.Color(thumbnailColor);
    
    const material = new THREE.MeshStandardMaterial({
      color: threeColor,
      metalness: 0.0,
      roughness: 0.6,
      side: THREE.DoubleSide,
    });
    
    return new THREE.Mesh(geometry, material);
  }, [mesh, thumbnailColor]);

  useEffect(() => {
    if (!canvasRef.current || !thumbnailMesh || hasRenderedRef.current) return;

    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    
    const renderer = getSharedRenderer();
    
    const renderSize = Math.max(size * window.devicePixelRatio, 64);
    renderer.setSize(renderSize, renderSize);

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(backgroundColor);
    
    if (sharedEnvMap) {
      scene.environment = sharedEnvMap;
      
      if (thumbnailMesh.material instanceof THREE.MeshStandardMaterial) {
        thumbnailMesh.material.envMap = sharedEnvMap;
        thumbnailMesh.material.envMapIntensity = 1.0;
        thumbnailMesh.material.needsUpdate = true;
      }
    }

    // Lighting setup
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.6);
    scene.add(ambientLight);

    const directionalLight = new THREE.DirectionalLight(0xffffff, 0.8);
    directionalLight.position.set(10, 10, 5);
    scene.add(directionalLight);

    const backLight = new THREE.DirectionalLight(0xffffff, 0.4);
    backLight.position.set(-10, -10, -5);
    scene.add(backLight);

    const topLight = new THREE.PointLight(0xffffff, 0.3);
    topLight.position.set(0, 10, 0);
    scene.add(topLight);

    const bottomLight = new THREE.PointLight(0xffffff, 0.3);
    bottomLight.position.set(0, -10, 0);
    scene.add(bottomLight);

    // Center the mesh
    const box = new THREE.Box3().setFromObject(thumbnailMesh);
    const center = box.getCenter(new THREE.Vector3());
    const boxSize = box.getSize(new THREE.Vector3());
    const maxDim = Math.max(boxSize.x, boxSize.y, boxSize.z);

    thumbnailMesh.position.sub(center);
    scene.add(thumbnailMesh);

    // Create orthographic camera
    const frustumSize = maxDim * 1.2;
    const camera = new THREE.OrthographicCamera(
      -frustumSize / 2,
      frustumSize / 2,
      frustumSize / 2,
      -frustumSize / 2,
      0.1,
      maxDim * 10
    );

    // Position camera for isometric view
    const distance = maxDim * 2;
    camera.position.set(distance, distance * 0.8, distance);
    camera.lookAt(0, 0, 0);

    renderer.render(scene, camera);

    // Copy to visible canvas
    canvas.width = size * window.devicePixelRatio;
    canvas.height = size * window.devicePixelRatio;
    ctx.drawImage(renderer.domElement, 0, 0, canvas.width, canvas.height);
    
    hasRenderedRef.current = true;

    return () => {
      releaseSharedRenderer();
      thumbnailMesh.geometry.dispose();
      if (thumbnailMesh.material instanceof THREE.Material) {
        thumbnailMesh.material.dispose();
      }
      hasRenderedRef.current = false;
    };
  }, [thumbnailMesh, size, backgroundColor]);

  const containerStyle: React.CSSProperties = {
    width: size,
    height: size,
    borderRadius: 4,
    ...style,
  };

  if (!mesh?.geometry) {
    return (
      <div 
        className={className}
        style={{
          ...containerStyle,
          backgroundColor: 'var(--muted, #f3f4f6)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <span style={{ fontSize: 8, color: 'var(--muted-foreground, #9ca3af)' }}>?</span>
      </div>
    );
  }

  return (
    <canvas 
      ref={canvasRef} 
      className={className}
      style={containerStyle}
    />
  );
};

export default PartThumbnail;
