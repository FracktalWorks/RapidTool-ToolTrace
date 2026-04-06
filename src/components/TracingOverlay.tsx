/**
 * TracingOverlay
 * 
 * SVG overlay component for displaying and interacting with tool outlines.
 * Renders traced contours, handles selection, and shows clearance offsets.
 */

import React, { useCallback, useMemo, useState } from 'react';
import { 
  contourToSVGPath, 
  offsetPolygon,
  type ToolOutline,
  type Point2D,
} from '../lib/geometry';

// ============================================================================
// Types
// ============================================================================

interface SelectionRect {
  startX: number;
  startY: number;
  endX: number;
  endY: number;
}

interface TracingOverlayProps {
  outlines: ToolOutline[];
  selectedId: string | null;
  clearancePixels: number;
  zoom: number;
  imageWidth: number;
  imageHeight: number;
  currentTool: 'select' | 'trace' | 'box' | 'edit' | 'erase' | 'pan';
  isTracing: boolean;
  onSelect: (id: string | null) => void;
  onDelete: (id: string) => void;
  onImageClick: (point: Point2D) => void;
  onBoxSelect?: (rect: { x: number; y: number; width: number; height: number }) => void;
  onUpdateOutline?: (id: string, points: Point2D[]) => void;
}

// ============================================================================
// Component
// ============================================================================

export const TracingOverlay: React.FC<TracingOverlayProps> = ({
  outlines,
  selectedId,
  clearancePixels,
  zoom,
  imageWidth,
  imageHeight,
  currentTool,
  isTracing,
  onSelect,
  onDelete,
  onImageClick,
  onBoxSelect,
  onUpdateOutline,
}) => {
  // State for box selection
  const [selectionRect, setSelectionRect] = useState<SelectionRect | null>(null);
  const [isDrawing, setIsDrawing] = useState(false);
  
  // State for point editing
  const [dragPoint, setDragPoint] = useState<{ id: string; index: number } | null>(null);

  // Get image coordinates from mouse event
  const getImageCoords = useCallback((e: React.MouseEvent<SVGSVGElement>) => {
    const svg = e.currentTarget;
    const rect = svg.getBoundingClientRect();
    const scaleX = imageWidth / rect.width;
    const scaleY = imageHeight / rect.height;
    return {
      x: (e.clientX - rect.left) * scaleX,
      y: (e.clientY - rect.top) * scaleY,
    };
  }, [imageWidth, imageHeight]);

  // Handle mouse down for box selection or click tracing
  const handleMouseDown = useCallback((e: React.MouseEvent<SVGSVGElement>) => {
    if (isTracing) return;
    
    if (currentTool === 'box') {
      const { x, y } = getImageCoords(e);
      setSelectionRect({ startX: x, startY: y, endX: x, endY: y });
      setIsDrawing(true);
    }
  }, [currentTool, isTracing, getImageCoords]);

  // Handle point mouse down
  const handlePointMouseDown = useCallback((e: React.MouseEvent, id: string, index: number) => {
    if (currentTool !== 'edit') return;
    e.stopPropagation();
    setDragPoint({ id, index });
  }, [currentTool]);

  // Handle mouse move for box selection or dragging
  const handleMouseMove = useCallback((e: React.MouseEvent<SVGSVGElement>) => {
    if (dragPoint && currentTool === 'edit' && onUpdateOutline) {
      const { x, y } = getImageCoords(e);
      const outline = outlines.find(o => o.id === dragPoint.id);
      if (outline) {
        const newPoints = [...outline.smoothedPoints];
        newPoints[dragPoint.index] = { x, y };
        onUpdateOutline(outline.id, newPoints);
      }
      return;
    }

    if (!isDrawing || currentTool !== 'box' || !selectionRect) return;
    const { x, y } = getImageCoords(e);
    setSelectionRect(prev => prev ? { ...prev, endX: x, endY: y } : null);
  }, [isDrawing, currentTool, selectionRect, getImageCoords, dragPoint, onUpdateOutline, outlines]);

  // Handle mouse up for box selection or dragging
  const handleMouseUp = useCallback((_e: React.MouseEvent<SVGSVGElement>) => {
    if (dragPoint) {
      setDragPoint(null);
      return;
    }

    if (currentTool === 'box' && isDrawing && selectionRect && onBoxSelect) {
      const x = Math.min(selectionRect.startX, selectionRect.endX);
      const y = Math.min(selectionRect.startY, selectionRect.endY);
      const width = Math.abs(selectionRect.endX - selectionRect.startX);
      const height = Math.abs(selectionRect.endY - selectionRect.startY);
      
      // Only trigger if selection is large enough
      if (width > 20 && height > 20) {
        onBoxSelect({ x, y, width, height });
      }
    }
    setIsDrawing(false);
    setSelectionRect(null);
  }, [currentTool, isDrawing, selectionRect, onBoxSelect, dragPoint]);

  // Handle click on SVG background (for click-to-trace)
  const handleBackgroundClick = useCallback((e: React.MouseEvent<SVGSVGElement>) => {
    if (currentTool !== 'trace' || isTracing) return;
    
    const { x, y } = getImageCoords(e);
    console.log('Click at image coords:', x, y);
    onImageClick({ x, y });
  }, [currentTool, isTracing, getImageCoords, onImageClick]);

  // Handle click on outline
  const handleOutlineClick = useCallback((e: React.MouseEvent, outlineId: string) => {
    e.stopPropagation();
    
    if (currentTool === 'select') {
      onSelect(selectedId === outlineId ? null : outlineId);
    } else if (currentTool === 'erase') {
      onDelete(outlineId);
    }
  }, [currentTool, selectedId, onSelect, onDelete]);

  // Cursor based on tool
  const cursor = useMemo(() => {
    if (isTracing) return 'wait';
    switch (currentTool) {
      case 'trace': return 'crosshair';
      case 'box': return 'crosshair';
      case 'select': return 'pointer';
      case 'erase': return 'not-allowed';
      case 'pan': return 'grab';
      default: return 'default';
    }
  }, [currentTool, isTracing]);

  // Stroke width adjusted for zoom
  const strokeWidth = Math.max(1, 2 / zoom);
  const handleRadius = Math.max(4, 8 / zoom);

  // Selection rectangle dimensions
  const selectionBox = selectionRect ? {
    x: Math.min(selectionRect.startX, selectionRect.endX),
    y: Math.min(selectionRect.startY, selectionRect.endY),
    width: Math.abs(selectionRect.endX - selectionRect.startX),
    height: Math.abs(selectionRect.endY - selectionRect.startY),
  } : null;

  return (
    <svg
      className="absolute inset-0 pointer-events-auto"
      width={imageWidth * zoom}
      height={imageHeight * zoom}
      viewBox={`0 0 ${imageWidth} ${imageHeight}`}
      style={{ cursor }}
      onClick={handleBackgroundClick}
      onMouseDown={handleMouseDown}
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
      onMouseLeave={handleMouseUp}
    >
      {/* Selection rectangle for box tool */}
      {selectionBox && selectionBox.width > 0 && selectionBox.height > 0 && (
        <rect
          x={selectionBox.x}
          y={selectionBox.y}
          width={selectionBox.width}
          height={selectionBox.height}
          fill="rgba(59, 130, 246, 0.1)"
          stroke="hsl(198, 89%, 50%)"
          strokeWidth={strokeWidth}
          strokeDasharray={`${8 / zoom} ${4 / zoom}`}
          style={{ pointerEvents: 'none' }}
        />
      )}
      
      {/* Render each outline */}
      {outlines.map((outline) => {
        const isSelected = outline.id === selectedId;
        const path = contourToSVGPath(outline.smoothedPoints, true);
        
        // Calculate offset path for clearance (using round joins for smooth result)
        const offsetPath = clearancePixels > 0
          ? contourToSVGPath(offsetPolygon(outline.smoothedPoints, clearancePixels), true)
          : null;

        return (
          <g key={outline.id}>
            {/* Clearance offset (dashed) */}
            {offsetPath && (
              <path
                d={offsetPath}
                fill="none"
                stroke={outline.color}
                strokeWidth={strokeWidth}
                strokeDasharray={`${4 / zoom} ${4 / zoom}`}
                opacity={0.5}
              />
            )}
            
            {/* Main outline */}
            <path
              d={path}
              fill={isSelected ? `${outline.color}20` : 'transparent'}
              stroke={outline.color}
              strokeWidth={isSelected ? strokeWidth * 2 : strokeWidth}
              onClick={(e) => handleOutlineClick(e, outline.id)}
              style={{ 
                cursor: currentTool === 'select' ? 'pointer' : 
                        currentTool === 'erase' ? 'not-allowed' : 'default',
              }}
              className="transition-all"
            />
            
            {/* Selection handles */}
            {isSelected && (
              <>
                {/* Bounding box */}
                <rect
                  x={outline.boundingBox.minX}
                  y={outline.boundingBox.minY}
                  width={outline.boundingBox.maxX - outline.boundingBox.minX}
                  height={outline.boundingBox.maxY - outline.boundingBox.minY}
                  fill="none"
                  stroke={outline.color}
                  strokeWidth={strokeWidth}
                  strokeDasharray={`${2 / zoom} ${2 / zoom}`}
                  opacity={0.5}
                />
                
                {/* Corner handles */}
                {[
                  { x: outline.boundingBox.minX, y: outline.boundingBox.minY },
                  { x: outline.boundingBox.maxX, y: outline.boundingBox.minY },
                  { x: outline.boundingBox.maxX, y: outline.boundingBox.maxY },
                  { x: outline.boundingBox.minX, y: outline.boundingBox.maxY },
                ].map((corner, i) => (
                  <circle
                    key={i}
                    cx={corner.x}
                    cy={corner.y}
                    r={handleRadius}
                    fill="white"
                    stroke={outline.color}
                    strokeWidth={strokeWidth}
                  />
                ))}
                
                {/* Custom Edit Points rendering */}
                {currentTool === 'edit' && outline.smoothedPoints.map((point, i) => (
                  <circle
                    key={`point-${i}`}
                    cx={point.x}
                    cy={point.y}
                    r={Math.max(3, 6 / zoom)}
                    fill="white"
                    stroke={outline.color}
                    strokeWidth={strokeWidth}
                    className="cursor-pointer hover:fill-current fill-white"
                    onMouseDown={(e) => handlePointMouseDown(e, outline.id, i)}
                  />
                ))}
                
                {/* Label */}
                <text
                  x={outline.boundingBox.minX}
                  y={outline.boundingBox.minY - 8 / zoom}
                  fill={outline.color}
                  fontSize={12 / zoom}
                  fontWeight="bold"
                >
                  {outline.name}
                </text>
              </>
            )}
          </g>
        );
      })}
      
      {/* Tracing indicator */}
      {isTracing && (
        <g>
          <rect
            x={0}
            y={0}
            width={imageWidth}
            height={imageHeight}
            fill="rgba(0,0,0,0.1)"
          />
          <text
            x={imageWidth / 2}
            y={imageHeight / 2}
            fill="white"
            fontSize={16 / zoom}
            textAnchor="middle"
            dominantBaseline="middle"
          >
            Tracing...
          </text>
        </g>
      )}
    </svg>
  );
};

export default TracingOverlay;
