/**
 * ControlPanel
 *
 * Right sidebar with step-based workflow controls.
 * Steps: Detect Paper → Trace Tools → Configure Layout → 3D Design → Export
 */

import React, { useCallback, useRef, useState, useEffect } from "react";
import {
  Image as ImageIcon,
  Wrench,
  Download,
  Upload,
  Trash2,
  Check,
  AlertCircle,
  ChevronRight,
  Loader2,
  RefreshCw,
  MousePointerClick,
  MousePointer2,
  SquareDashed,
  Hand,
  Circle,
  Square,
  RectangleHorizontal,
  Shapes,
  X,
  Lightbulb,
  Camera,
  FileText,
  Sparkles,
} from "lucide-react";

import { useAppStore } from "../stores";
import { detectPaper } from "../workers";
import { downloadSVG } from "../lib/exportSVG";
import { downloadSTL } from "../lib/exportSTL";
import { offsetPolygon } from "../lib/geometry";

// ============================================================================
// Paper Detection Step Panel (includes image upload)
// ============================================================================

const PaperStepPanel: React.FC = () => {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const {
    imageFile,
    setImage,
    clearImage,
    paperDetected,
    paperConfidence,
    pixelsPerMm,
    imageUrl,
    setCurrentStep,
    setPaperDetected,
    setPaperCorners,
    setPixelsPerMm,
  } = useAppStore();

  const [isDetecting, setIsDetecting] = useState(false);
  const [detectionMessage, setDetectionMessage] = useState<string | null>(null);

  const handleFileSelect = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (file) {
        setImage(file);
      }
    },
    [setImage],
  );

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      const file = e.dataTransfer.files[0];
      if (file && file.type.startsWith("image/")) {
        setImage(file);
      }
    },
    [setImage],
  );

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
  }, []);

  const runAutoDetect = useCallback(async () => {
    if (!imageUrl) return;

    setIsDetecting(true);
    setDetectionMessage(null);

    try {
      const result = await detectPaper(imageUrl);

      if (result.detected && result.corners) {
        setPaperCorners(result.corners);
        setPaperDetected(true, result.confidence);
        if (result.pixelsPerMm) {
          setPixelsPerMm(result.pixelsPerMm);
        }
        setDetectionMessage("Paper detected successfully");
      } else {
        setDetectionMessage(
          result.message ||
            "Could not detect paper. Please adjust corners manually.",
        );
        setPaperDetected(false, 0);
      }
    } catch (error) {
      console.error("Paper detection error:", error);
      setDetectionMessage("Detection failed. Please set corners manually.");
    } finally {
      setIsDetecting(false);
    }
  }, [imageUrl, setPaperDetected, setPaperCorners, setPixelsPerMm]);

  // Auto-detect when image is loaded
  React.useEffect(() => {
    if (imageUrl && !paperDetected && !isDetecting) {
      runAutoDetect();
    }
  }, [imageUrl]);

  const handleRetryDetection = useCallback(() => {
    setPaperDetected(false, 0);
    setDetectionMessage(null);
    runAutoDetect();
  }, [setPaperDetected, runAutoDetect]);

  const handleManualMode = useCallback(() => {
    setPaperCorners({
      topLeft: { x: 100, y: 100 },
      topRight: { x: 400, y: 100 },
      bottomRight: { x: 400, y: 500 },
      bottomLeft: { x: 100, y: 500 },
    });
    setPaperDetected(true, 0.5);
    setDetectionMessage("Manual mode - drag corners to match paper edges");
  }, [setPaperCorners, setPaperDetected]);

  return (
    <div className="h-full flex flex-col">
      {/* Hidden file input */}
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        onChange={handleFileSelect}
        className="hidden"
      />

      {/* When no image is loaded - show helpful getting started content */}
      {!imageFile ? (
        <div className="h-full flex flex-col">
          {/* Top section - scrollable tips */}
          <div className="flex-1 overflow-y-auto space-y-4">
            {/* Quick Start Section */}
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <Sparkles className="w-4 h-4 text-[hsl(var(--primary))]" />
                <h3 className="text-xs font-semibold">Quick Start</h3>
              </div>
              <p className="text-[11px] text-[hsl(var(--muted-foreground))] leading-relaxed">
                Upload a photo of your tools on white A4 paper. We'll
                auto-detect and trace them.
              </p>
            </div>

            {/* Best Practices */}
            <div className="space-y-2.5">
              <div className="flex items-center gap-2">
                <Lightbulb className="w-4 h-4 text-[hsl(var(--warning))]" />
                <h3 className="text-xs font-semibold">Best Practices</h3>
              </div>

              <div className="space-y-2">
                {/* Tip 1 */}
                <div className="flex gap-2.5 p-2.5 bg-[hsl(var(--muted)/0.4)] rounded-lg">
                  <div className="w-6 h-6 rounded-md bg-[hsl(var(--primary)/0.1)] flex items-center justify-center shrink-0">
                    <FileText className="w-3.5 h-3.5 text-[hsl(var(--primary))]" />
                  </div>
                  <div>
                    <p className="text-[11px] font-medium">
                      Use White A4 Paper
                    </p>
                    <p className="text-[10px] text-[hsl(var(--muted-foreground))] mt-0.5">
                      Standard A4 provides accurate scale
                    </p>
                  </div>
                </div>

                {/* Tip 2 */}
                <div className="flex gap-2.5 p-2.5 bg-[hsl(var(--muted)/0.4)] rounded-lg">
                  <div className="w-6 h-6 rounded-md bg-[hsl(var(--primary)/0.1)] flex items-center justify-center shrink-0">
                    <Camera className="w-3.5 h-3.5 text-[hsl(var(--primary))]" />
                  </div>
                  <div>
                    <p className="text-[11px] font-medium">Shoot from Above</p>
                    <p className="text-[10px] text-[hsl(var(--muted-foreground))] mt-0.5">
                      Keep camera parallel to paper
                    </p>
                  </div>
                </div>

                {/* Tip 3 */}
                <div className="flex gap-2.5 p-2.5 bg-[hsl(var(--muted)/0.4)] rounded-lg">
                  <div className="w-6 h-6 rounded-md bg-[hsl(var(--primary)/0.1)] flex items-center justify-center shrink-0">
                    <Lightbulb className="w-3.5 h-3.5 text-[hsl(var(--primary))]" />
                  </div>
                  <div>
                    <p className="text-[11px] font-medium">Good Lighting</p>
                    <p className="text-[10px] text-[hsl(var(--muted-foreground))] mt-0.5">
                      Avoid shadows for cleaner detection
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Bottom section - What Happens Next */}
          <div className="pt-3 mt-auto border-t border-[hsl(var(--border))]">
            <h3 className="text-xs font-semibold text-[hsl(var(--foreground))] mb-3">
              What Happens Next
            </h3>
            <div className="space-y-2">
              <div className="flex items-center gap-2.5">
                <div className="w-5 h-5 rounded-full bg-[hsl(var(--primary))] text-white flex items-center justify-center text-[10px] font-bold shrink-0">
                  1
                </div>
                <span className="text-[11px] text-[hsl(var(--muted-foreground))]">
                  Paper auto-detected
                </span>
              </div>
              <div className="flex items-center gap-2.5">
                <div className="w-5 h-5 rounded-full bg-[hsl(var(--muted))] text-[hsl(var(--muted-foreground))] flex items-center justify-center text-[10px] font-bold shrink-0">
                  2
                </div>
                <span className="text-[11px] text-[hsl(var(--muted-foreground))]">
                  Click to trace tools
                </span>
              </div>
              <div className="flex items-center gap-2.5">
                <div className="w-5 h-5 rounded-full bg-[hsl(var(--muted))] text-[hsl(var(--muted-foreground))] flex items-center justify-center text-[10px] font-bold shrink-0">
                  3
                </div>
                <span className="text-[11px] text-[hsl(var(--muted-foreground))]">
                  Arrange in layout
                </span>
              </div>
              <div className="flex items-center gap-2.5">
                <div className="w-5 h-5 rounded-full bg-[hsl(var(--muted))] text-[hsl(var(--muted-foreground))] flex items-center justify-center text-[10px] font-bold shrink-0">
                  4
                </div>
                <span className="text-[11px] text-[hsl(var(--muted-foreground))]">
                  Export SVG or STL
                </span>
              </div>
            </div>
          </div>
        </div>
      ) : (
        /* When image is loaded - show image info and detection status */
        <>
          <div className="flex-1 overflow-y-auto space-y-3">
            {/* Loaded image indicator */}
            <div className="flex items-center gap-2.5 p-2.5 bg-[hsl(var(--muted)/0.5)] rounded-lg">
              <div className="w-8 h-8 rounded bg-[hsl(var(--background))] flex items-center justify-center">
                <ImageIcon className="w-4 h-4 text-[hsl(var(--muted-foreground))]" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-xs font-medium truncate">{imageFile.name}</p>
                <p className="text-[10px] text-[hsl(var(--muted-foreground))]">
                  {(imageFile.size / 1024 / 1024).toFixed(2)} MB
                </p>
              </div>
              <button
                onClick={clearImage}
                className="p-1.5 hover:bg-[hsl(var(--destructive)/0.1)] rounded transition-colors"
                title="Remove image"
              >
                <Trash2 className="w-3.5 h-3.5 text-[hsl(var(--destructive))]" />
              </button>
            </div>
          </div>

          {/* Bottom Section - Detection Status & CTA */}
          <div className="pt-3 border-t border-[hsl(var(--border))] mt-3 space-y-3">
            {/* Detection Status */}
            {isDetecting ? (
              <div className="flex items-center gap-2 p-2.5 bg-[hsl(var(--primary)/0.05)] border border-[hsl(var(--primary)/0.1)] rounded-lg">
                <Loader2 className="w-3.5 h-3.5 text-[hsl(var(--primary))] animate-spin" />
                <span className="text-xs text-[hsl(var(--primary))]">
                  Detecting paper...
                </span>
              </div>
            ) : paperDetected ? (
              <>
                <div className="flex items-center gap-2 p-2.5 bg-[hsl(var(--success)/0.08)] border border-[hsl(var(--success)/0.15)] rounded-lg">
                  <Check className="w-3.5 h-3.5 text-[hsl(var(--success))]" />
                  <span className="text-xs text-[hsl(var(--success))]">
                    Detected ({Math.round(paperConfidence * 100)}% confidence)
                  </span>
                </div>

                {pixelsPerMm && (
                  <div className="flex items-center justify-between p-2.5 bg-[hsl(var(--muted)/0.5)] rounded-lg">
                    <span className="text-[10px] text-[hsl(var(--muted-foreground))] uppercase tracking-wide">
                      Scale
                    </span>
                    <span className="text-xs font-medium font-tech">
                      {pixelsPerMm.toFixed(2)} px/mm
                    </span>
                  </div>
                )}

                <p className="text-[10px] text-[hsl(var(--muted-foreground))]">
                  Drag corner handles in viewport to adjust if needed.
                </p>

                <div className="flex gap-2">
                  <button
                    onClick={handleRetryDetection}
                    className="
                      flex-1 h-8 px-3 border border-[hsl(var(--border))]
                      rounded text-xs hover:bg-[hsl(var(--muted))]
                      transition-colors flex items-center justify-center gap-1.5
                    "
                  >
                    <RefreshCw className="w-3 h-3" />
                    Re-detect
                  </button>
                  <button
                    onClick={() => setCurrentStep("tools")}
                    className="
                      flex-1 h-8 px-3 bg-[hsl(var(--primary))] text-[hsl(var(--primary-foreground))]
                      rounded text-xs font-medium hover:bg-[hsl(var(--primary)/0.9)]
                      transition-colors flex items-center justify-center gap-1.5
                    "
                  >
                    Continue
                    <ChevronRight className="w-3 h-3" />
                  </button>
                </div>
              </>
            ) : (
              <>
                {detectionMessage && (
                  <div className="flex items-start gap-2 p-2.5 bg-[hsl(var(--warning)/0.08)] border border-[hsl(var(--warning)/0.15)] rounded-lg">
                    <AlertCircle className="w-3.5 h-3.5 text-[hsl(var(--warning))] shrink-0 mt-0.5" />
                    <span className="text-[10px] text-[hsl(var(--warning))]">
                      {detectionMessage}
                    </span>
                  </div>
                )}

                <div className="flex gap-2">
                  <button
                    onClick={handleManualMode}
                    disabled={isDetecting}
                    className="
                      flex-1 h-8 px-3 border border-[hsl(var(--border))]
                      rounded text-xs hover:bg-[hsl(var(--muted))]
                      transition-colors
                    "
                  >
                    Set Manually
                  </button>
                  <button
                    onClick={runAutoDetect}
                    disabled={isDetecting}
                    className="
                      flex-1 h-8 px-3 bg-[hsl(var(--primary))] text-[hsl(var(--primary-foreground))]
                      rounded text-xs font-medium hover:bg-[hsl(var(--primary)/0.9)]
                      transition-colors flex items-center justify-center gap-1.5
                      disabled:opacity-50 disabled:cursor-not-allowed
                    "
                  >
                    {isDetecting ? (
                      <>
                        <Loader2 className="w-3 h-3 animate-spin" />
                        Detecting...
                      </>
                    ) : (
                      "Retry"
                    )}
                  </button>
                </div>
              </>
            )}
          </div>
        </>
      )}
    </div>
  );
};

// ============================================================================
// Tools Step Panel
// ============================================================================

const ToolsStepPanel: React.FC = () => {
  const {
    toolOutlines,
    selectedOutlineId,
    selectOutline,
    removeToolOutline,
    addToolOutline,
    setToolOutlines,
    paperDetected,
    setCurrentStep,
    clearanceValue,
    setClearanceValue,
    activeTool,
    setActiveTool,
    imageUrl,
    pixelsPerMm,
    paperCorners,
    snapToPill,
  } = useAppStore();

  const [isAutoDetecting, setIsAutoDetecting] = useState(false);
  const [autoDetectDone, setAutoDetectDone] = useState(false);
  const [autoDetectCount, setAutoDetectCount] = useState(0);

  // Show UI even when paper not detected, just disable interactions
  // const isDisabled = !paperDetected;
  const isDisabled = false;

  // Auto-detect all tools function
  const runAutoDetect = useCallback(async () => {
    if (!imageUrl || isAutoDetecting) return;
    
    setIsAutoDetecting(true);
    try {
      const { traceAllTools } = await import('../workers');
      const { smoothContour, getBoundingBox } = await import('../lib/geometry');
      
      const results = await traceAllTools(imageUrl, paperCorners);
      
      if (results && results.length > 0) {
        const TOOL_COLORS = [
          '#3b82f6', '#ef4444', '#22c55e', '#f59e0b',
          '#8b5cf6', '#ec4899', '#06b6d4', '#f97316',
        ];
        
        const newOutlines = results.map((result, index) => {
          const smoothed = smoothContour(result.points);
          const bbox = getBoundingBox(result.points);
          return {
            id: `tool-${Date.now()}-${index}-${Math.random().toString(36).substr(2, 9)}`,
            points: result.points,
            smoothedPoints: smoothed,
            boundingBox: bbox,
            area: result.area,
            areaInMm2: pixelsPerMm ? result.area / (pixelsPerMm * pixelsPerMm) : undefined,
            color: TOOL_COLORS[index % TOOL_COLORS.length],
            name: `Tool ${index + 1}`,
          };
        });
        
        setToolOutlines(newOutlines);
        setAutoDetectCount(results.length);
      }
      setAutoDetectDone(true);
    } catch (error) {
      console.error('Auto-detect failed:', error);
      setAutoDetectDone(true);
    } finally {
      setIsAutoDetecting(false);
    }
  }, [imageUrl, isAutoDetecting, pixelsPerMm, setToolOutlines, paperCorners]);

  const autoDetectRef = useRef<string | null>(null);

  // Auto-run detection when step is first entered
  useEffect(() => {
    if (imageUrl && !autoDetectDone && toolOutlines.length === 0 && autoDetectRef.current !== imageUrl) {
      autoDetectRef.current = imageUrl;
      runAutoDetect();
    }
  }, [imageUrl, autoDetectDone, toolOutlines.length, runAutoDetect]);

  return (
    <div className="h-full flex flex-col">
      {/* Prerequisite Warning Banner */}
      {isDisabled && (
        <div className="mb-3 p-2.5 bg-[hsl(var(--warning)/0.1)] border border-[hsl(var(--warning)/0.2)] rounded-lg flex items-center gap-2">
          <AlertCircle className="w-4 h-4 text-[hsl(var(--warning))] shrink-0" />
          <p className="text-[10px] text-[hsl(var(--warning))]">
            Complete paper detection first to enable tracing
          </p>
        </div>
      )}

      {/* Scrollable Content */}
      <div
        className={`flex-1 overflow-y-auto space-y-3 ${isDisabled ? "opacity-60 pointer-events-none" : ""}`}
      >
        {/* Auto Detect Banner */}
        {isAutoDetecting && (
          <div className="flex items-center gap-2 p-2.5 bg-[hsl(var(--primary)/0.05)] border border-[hsl(var(--primary)/0.1)] rounded-lg">
            <Loader2 className="w-3.5 h-3.5 text-[hsl(var(--primary))] animate-spin" />
            <span className="text-xs text-[hsl(var(--primary))]">
              Auto-detecting tools...
            </span>
          </div>
        )}
        
        {autoDetectDone && autoDetectCount > 0 && !isAutoDetecting && (
          <div className="flex items-center gap-2 p-2.5 bg-[hsl(var(--success)/0.08)] border border-[hsl(var(--success)/0.15)] rounded-lg">
            <Sparkles className="w-3.5 h-3.5 text-[hsl(var(--success))]" />
            <span className="text-xs text-[hsl(var(--success))]">
              {autoDetectCount} tool{autoDetectCount !== 1 ? 's' : ''} auto-detected
            </span>
          </div>
        )}

        {/* Auto Detect Button */}
        <button
          onClick={runAutoDetect}
          disabled={isAutoDetecting || isDisabled}
          className="
            w-full h-9 px-3 bg-[hsl(var(--primary)/0.1)] text-[hsl(var(--primary))]
            border border-[hsl(var(--primary)/0.2)]
            rounded-lg text-xs font-medium hover:bg-[hsl(var(--primary)/0.15)]
            transition-colors flex items-center justify-center gap-1.5
            disabled:opacity-50 disabled:cursor-not-allowed
          "
        >
          {isAutoDetecting ? (
            <>
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
              Detecting...
            </>
          ) : (
            <>
              <Sparkles className="w-3.5 h-3.5" />
              Auto Detect All Tools
            </>
          )}
        </button>

        {/* Tracing Mode Selection */}
        <div className="space-y-1.5">
          <label className="text-[10px] font-medium text-[hsl(var(--muted-foreground))] uppercase tracking-wide">
            Manual Tracing
          </label>
          <div className="grid grid-cols-3 gap-2">
            <button
              onClick={() => setActiveTool("box")}
              disabled={isDisabled}
              className={`
                p-2.5 rounded-lg border transition-all text-left
                ${
                  activeTool === "box"
                    ? "border-[hsl(var(--primary))] bg-[hsl(var(--primary)/0.08)]"
                    : "border-[hsl(var(--border))] hover:border-[hsl(var(--primary)/0.5)] hover:bg-[hsl(var(--muted)/0.5)]"
                }
              `}
            >
              <SquareDashed
                className={`w-4 h-4 mb-1.5 ${activeTool === "box" ? "text-[hsl(var(--primary))]" : "text-[hsl(var(--muted-foreground))]"}`}
              />
              <div className="text-xs font-medium">Box Select</div>
              <div className="text-[10px] text-[hsl(var(--muted-foreground))] mt-0.5">
                Draw rectangle area
              </div>
            </button>
            <button
              onClick={() => setActiveTool("trace")}
              disabled={isDisabled}
              className={`
                p-2.5 rounded-lg border transition-all text-left
                ${
                  activeTool === "trace"
                    ? "border-[hsl(var(--primary))] bg-[hsl(var(--primary)/0.08)]"
                    : "border-[hsl(var(--border))] hover:border-[hsl(var(--primary)/0.5)] hover:bg-[hsl(var(--muted)/0.5)]"
                }
              `}
            >
              <MousePointerClick
                className={`w-4 h-4 mb-1.5 ${activeTool === "trace" ? "text-[hsl(var(--primary))]" : "text-[hsl(var(--muted-foreground))]"}`}
              />
              <div className="text-xs font-medium">Click Trace</div>
              <div className="text-[10px] text-[hsl(var(--muted-foreground))] mt-0.5">
                Auto-detect on click
              </div>
            </button>
            <button
              onClick={() => setActiveTool("edit")}
              disabled={isDisabled}
              className={`
                p-2.5 rounded-lg border transition-all text-left
                ${
                  activeTool === "edit"
                    ? "border-[hsl(var(--primary))] bg-[hsl(var(--primary)/0.08)]"
                    : "border-[hsl(var(--border))] hover:border-[hsl(var(--primary)/0.5)] hover:bg-[hsl(var(--muted)/0.5)]"
                }
              `}
            >
              <MousePointer2
                className={`w-4 h-4 mb-1.5 ${activeTool === "edit" ? "text-[hsl(var(--primary))]" : "text-[hsl(var(--muted-foreground))]"}`}
              />
              <div className="text-xs font-medium">Edit Pts</div>
              <div className="text-[10px] text-[hsl(var(--muted-foreground))] mt-0.5">
                Adjust points
              </div>
            </button>
          </div>
        </div>

        {/* Mode Info */}
        <div className="p-2.5 bg-[hsl(var(--muted)/0.5)] rounded-lg">
          <p className="text-[10px] text-[hsl(var(--muted-foreground))]">
            {activeTool === "box"
              ? "Draw a rectangle around the tool to trace it"
              : activeTool === "trace"
              ? "Click directly on a tool to auto-detect its outline" : "Select a listed tool, then drag its points below to precisely align its curves"}
          </p>
        </div>

        {/* Tool List */}
        <div className="space-y-1.5">
          <label className="text-[10px] font-medium text-[hsl(var(--muted-foreground))] uppercase tracking-wide">
            Traced Tools ({toolOutlines.length})
          </label>
          {toolOutlines.length > 0 ? (
            <div className="space-y-1 max-h-40 overflow-y-auto">
              {toolOutlines.map((outline) => (
                <div
                  key={outline.id}
                  className={`
                    flex items-center gap-2 p-2 rounded-md cursor-pointer transition-colors
                    ${
                      outline.id === selectedOutlineId
                        ? "bg-[hsl(var(--primary)/0.1)] border border-[hsl(var(--primary)/0.2)]"
                        : "hover:bg-[hsl(var(--muted)/0.5)] border border-transparent"
                    }
                  `}
                  onClick={() => selectOutline(outline.id)}
                >
                  <div
                    className="w-3 h-3 rounded-full shrink-0"
                    style={{ backgroundColor: outline.color }}
                  />
                  <div className="flex-1 min-w-0">
                    <span className="text-xs truncate block">
                      {outline.name}
                    </span>
                    {outline.areaInMm2 && (
                      <span className="text-[10px] text-[hsl(var(--muted-foreground))]">
                        {outline.areaInMm2.toFixed(1)} mm²
                      </span>
                    )}
                  </div>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      snapToPill(outline.id);
                    }}
                    className="p-1 hover:bg-[hsl(var(--primary)/0.1)] rounded transition-colors shrink-0 mr-1"
                    title="Snap to geometric shape (Pill)"
                  >
                    <Sparkles className="w-3 h-3 text-[hsl(var(--primary))]" />
                  </button>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      removeToolOutline(outline.id);
                    }}
                    className="p-1 hover:bg-[hsl(var(--destructive)/0.1)] rounded transition-colors shrink-0"
                    title="Remove"
                  >
                    <Trash2 className="w-3 h-3 text-[hsl(var(--destructive))]" />
                  </button>
                </div>
              ))}
            </div>
          ) : (
            <div className="p-3 border border-dashed border-[hsl(var(--border))] rounded-lg text-center">
              <Wrench className="w-5 h-5 mx-auto mb-1.5 text-[hsl(var(--muted-foreground))] opacity-50" />
              <p className="text-[10px] text-[hsl(var(--muted-foreground))]">
                No tools traced yet. Click on a tool in the image to begin.
              </p>
            </div>
          )}
        </div>
      </div>

      {/* Bottom Section - Clearance & CTA */}
      <div
        className={`pt-3 border-t border-[hsl(var(--border))] mt-3 space-y-3 ${isDisabled ? "opacity-60 pointer-events-none" : ""}`}
      >
        {/* Clearance Control */}
        <div className="space-y-1.5">
          <div className="flex items-center justify-between">
            <label className="text-[10px] font-medium text-[hsl(var(--muted-foreground))] uppercase tracking-wide">
              Clearance
            </label>
            <span className="text-xs font-medium font-tech">
              {clearanceValue.toFixed(1)}mm
            </span>
          </div>
          <input
            type="range"
            min="0"
            max="3"
            step="0.1"
            value={clearanceValue}
            onChange={(e) => setClearanceValue(parseFloat(e.target.value))}
            disabled={isDisabled}
            className="w-full h-1.5 bg-[hsl(var(--muted))] rounded-full appearance-none cursor-pointer"
          />
        </div>

        {/* CTA Button */}
        <button
          onClick={() => setCurrentStep("layout")}
          disabled={toolOutlines.length === 0}
          className="
            w-full h-8 px-3 bg-[hsl(var(--primary))] text-[hsl(var(--primary-foreground))]
            rounded text-xs font-medium hover:bg-[hsl(var(--primary)/0.9)]
            transition-colors flex items-center justify-center gap-1.5
            disabled:opacity-50 disabled:cursor-not-allowed
          "
        >
          Continue
          <ChevronRight className="w-3 h-3" />
        </button>
      </div>
    </div>
  );
};

// ============================================================================
// Export Step Panel
// ============================================================================

const ExportStepPanel: React.FC = () => {
  const {
    toolOutlines,
    exportFormat,
    setExportFormat,
    setProcessing,
    pixelsPerMm,
    clearanceValue,
    layoutState,
    designSettings,
  } = useAppStore();

  // Check prerequisites
  const hasTools = toolOutlines.length > 0;
  const hasLayout = layoutState.shapes.length > 0;
  // const isDisabled = !hasTools || !hasLayout;
  const isDisabled = false;

  const handleExport = useCallback(async () => {
    if (!pixelsPerMm) {
      alert("Paper calibration required for accurate export");
      return;
    }

    setProcessing(true, `Exporting ${exportFormat.toUpperCase()}...`);

    try {
      // Prepare outlines for export (apply clearance)
      const outlinesToExport = toolOutlines.map((outline) => ({
        id: outline.id,
        name: outline.name,
        points:
          clearanceValue > 0
            ? offsetPolygon(
                outline.smoothedPoints,
                clearanceValue * pixelsPerMm,
                { joinType: "round" },
              )
            : outline.smoothedPoints,
        color: outline.color,
      }));

      if (exportFormat === "svg") {
        downloadSVG(outlinesToExport, pixelsPerMm, "tooltrace-export.svg");
      } else {
        const { generateExportMesh } = await import("./ExportWorkspace");
        const { STLExporter } = await import("three-stdlib");
        const THREE = await import("three");

        const mesh = generateExportMesh(layoutState, toolOutlines, pixelsPerMm, designSettings);
        
        const exporter = new STLExporter();
        const scene = new THREE.Scene();
        scene.add(mesh);
        
        const stlData = exporter.parse(scene, { binary: true });
        
        const arrayBuffer = new ArrayBuffer(stlData.byteLength);
        new Uint8Array(arrayBuffer).set(new Uint8Array(stlData.buffer, stlData.byteOffset, stlData.byteLength));
        
        const blob = new Blob([arrayBuffer], { type: 'application/sla' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = 'tooltrace-export.stl';
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(url);
        
        // Clean up
        mesh.geometry.dispose();
        if (mesh.material instanceof THREE.Material) {
          mesh.material.dispose();
        }
      }
    } catch (error) {
      console.error("Export failed:", error);
      alert(
        `Export failed: ${error instanceof Error ? error.message : "Unknown error"}`,
      );
    } finally {
      setProcessing(false);
    }
  }, [exportFormat, setProcessing, toolOutlines, pixelsPerMm, clearanceValue]);

  return (
    <div className="h-full flex flex-col">
      {/* Prerequisite Warning Banner */}
      {isDisabled && (
        <div className="mb-3 p-2.5 bg-[hsl(var(--warning)/0.1)] border border-[hsl(var(--warning)/0.2)] rounded-lg flex items-start gap-2">
          <AlertCircle className="w-4 h-4 text-[hsl(var(--warning))] shrink-0 mt-0.5" />
          <div className="text-[10px] text-[hsl(var(--warning))]">
            {!hasTools && <p>• Trace tools in step 2</p>}
            {!hasLayout && <p>• Configure layout in step 3</p>}
          </div>
        </div>
      )}

      {/* Scrollable Content */}
      <div
        className={`flex-1 overflow-y-auto space-y-3 ${isDisabled ? "opacity-60 pointer-events-none" : ""}`}
      >
        {/* Format Selection */}
        <div className="space-y-1.5">
          <label className="text-[10px] font-medium text-[hsl(var(--muted-foreground))] uppercase tracking-wide">
            Export Format
          </label>
          <div className="grid grid-cols-2 gap-2">
            <button
              onClick={() => setExportFormat("svg")}
              disabled={isDisabled}
              className={`
                h-8 px-3 rounded font-medium text-xs transition-colors
                ${
                  exportFormat === "svg"
                    ? "bg-[hsl(var(--primary))] text-[hsl(var(--primary-foreground))]"
                    : "bg-[hsl(var(--muted)/0.5)] text-[hsl(var(--foreground))] hover:bg-[hsl(var(--muted))]"
                }
              `}
            >
              SVG
            </button>
            <button
              onClick={() => setExportFormat("stl")}
              disabled={isDisabled}
              className={`
                h-8 px-3 rounded font-medium text-xs transition-colors
                ${
                  exportFormat === "stl"
                    ? "bg-[hsl(var(--primary))] text-[hsl(var(--primary-foreground))]"
                    : "bg-[hsl(var(--muted)/0.5)] text-[hsl(var(--foreground))] hover:bg-[hsl(var(--muted))]"
                }
              `}
            >
              STL
            </button>
          </div>
        </div>

        {/* Format Info */}
        <div className="p-2.5 bg-[hsl(var(--muted)/0.5)] rounded-lg">
          <p className="text-[10px] text-[hsl(var(--muted-foreground))]">
            {exportFormat === "svg"
              ? "Export as scalable vector graphic for laser cutting or CNC."
              : "Export as 3D mesh for Gridfinity-style tool holder cutouts."}
          </p>
        </div>

        {/* Export Summary */}
        <div className="space-y-1.5">
          <label className="text-[10px] font-medium text-[hsl(var(--muted-foreground))] uppercase tracking-wide">
            Summary
          </label>
          <div className="p-2.5 border border-[hsl(var(--border))] rounded-lg space-y-1">
            <div className="flex items-center justify-between">
              <span className="text-[10px] text-[hsl(var(--muted-foreground))]">
                Tools
              </span>
              <span className="text-xs font-medium">{toolOutlines.length}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-[10px] text-[hsl(var(--muted-foreground))]">
                Layout Shapes
              </span>
              <span className="text-xs font-medium">
                {layoutState.shapes.length}
              </span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-[10px] text-[hsl(var(--muted-foreground))]">
                Format
              </span>
              <span className="text-xs font-medium">
                {exportFormat.toUpperCase()}
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* CTA Button - Fixed at bottom */}
      <div
        className={`pt-3 border-t border-[hsl(var(--border))] mt-3 ${isDisabled ? "opacity-60 pointer-events-none" : ""}`}
      >
        <button
          onClick={handleExport}
          disabled={isDisabled || toolOutlines.length === 0}
          className="
            w-full h-8 px-3 bg-[hsl(var(--success))] text-white
            rounded text-xs font-medium hover:bg-[hsl(var(--success)/0.9)]
            transition-colors flex items-center justify-center gap-1.5
            disabled:opacity-50 disabled:cursor-not-allowed
          "
        >
          <Download className="w-3 h-3" />
          Export {exportFormat.toUpperCase()}
        </button>
      </div>
    </div>
  );
};

// ============================================================================
// Configure Layout Step Panel
// ============================================================================

const LayoutStepPanel: React.FC = () => {
  const {
    toolOutlines,
    setCurrentStep,
    layoutState,
    setLayoutTool,
    setLayoutGrid,
    clearAllLayoutShapes,
    initializeLayoutFromTools,
    removeLayoutShape,
  } = useAppStore();

  const { grid, shapes, layoutTool } = layoutState;

  // Check prerequisites
  const hasTools = toolOutlines.length > 0;
  // const isDisabled = !hasTools;
  const isDisabled = false;

  // Initialize layout from tools when entering this step
  useEffect(() => {
    if (shapes.length === 0 && toolOutlines.length > 0) {
      initializeLayoutFromTools();
    }
  }, []);

  return (
    <div className="h-full flex flex-col">
      {/* Prerequisite Warning Banner */}
      {isDisabled && (
        <div className="mb-3 p-2.5 bg-[hsl(var(--warning)/0.1)] border border-[hsl(var(--warning)/0.2)] rounded-lg flex items-center gap-2">
          <AlertCircle className="w-4 h-4 text-[hsl(var(--warning))] shrink-0" />
          <p className="text-[10px] text-[hsl(var(--warning))]">
            Trace tools in step 2 first to configure layout
          </p>
        </div>
      )}

      {/* Scrollable Content */}
      <div
        className={`flex-1 overflow-y-auto space-y-4 ${isDisabled ? "opacity-60 pointer-events-none" : ""}`}
      >
        {/* Grid Settings */}
        <div className="space-y-2">
          <label className="text-[10px] font-medium text-[hsl(var(--muted-foreground))] uppercase tracking-wide">
            Grid Size
          </label>
          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-1">
              <span className="text-[10px] text-[hsl(var(--muted-foreground))]">
                Columns
              </span>
              <input
                type="number"
                min={1}
                max={10}
                value={grid.cols}
                onChange={(e) =>
                  setLayoutGrid({
                    cols: Math.max(
                      1,
                      Math.min(10, parseInt(e.target.value) || 1),
                    ),
                  })
                }
                className="w-full h-8 px-2 text-xs rounded border border-[hsl(var(--border))] bg-[hsl(var(--background))] focus:outline-none focus:border-[hsl(var(--primary))]"
              />
            </div>
            <div className="space-y-1">
              <span className="text-[10px] text-[hsl(var(--muted-foreground))]">
                Rows
              </span>
              <input
                type="number"
                min={1}
                max={10}
                value={grid.rows}
                onChange={(e) =>
                  setLayoutGrid({
                    rows: Math.max(
                      1,
                      Math.min(10, parseInt(e.target.value) || 1),
                    ),
                  })
                }
                className="w-full h-8 px-2 text-xs rounded border border-[hsl(var(--border))] bg-[hsl(var(--background))] focus:outline-none focus:border-[hsl(var(--primary))]"
              />
            </div>
          </div>
          <p className="text-[10px] text-[hsl(var(--muted-foreground))]">
            {grid.cols * grid.cellWidthMm} × {grid.rows * grid.cellHeightMm} mm
            total
          </p>
        </div>

        {/* Add Simple Shapes Section */}
        <div className="space-y-2">
          <label className="text-[10px] font-medium text-[hsl(var(--muted-foreground))] uppercase tracking-wide">
            Add Simple Shapes
          </label>
          <div className="grid grid-cols-2 gap-1.5">
            {/* Finger Notch */}
            <button
              onClick={() =>
                setLayoutTool(
                  layoutTool === "finger-notch" ? "select" : "finger-notch",
                )
              }
              className={`
                flex flex-col items-center justify-center gap-1 p-2.5 rounded-md transition-colors
                ${
                  layoutTool === "finger-notch"
                    ? "bg-[hsl(var(--primary)/0.1)] border border-[hsl(var(--primary)/0.3)]"
                    : "hover:bg-[hsl(var(--muted)/0.5)] border border-[hsl(var(--border))]"
                }
              `}
            >
              <Hand
                className={`w-4 h-4 ${layoutTool === "finger-notch" ? "text-[hsl(var(--primary))]" : "text-[hsl(var(--muted-foreground))]"}`}
              />
              <span className="text-[10px]">Finger Notch</span>
            </button>

            {/* Circle */}
            <button
              onClick={() =>
                setLayoutTool(layoutTool === "circle" ? "select" : "circle")
              }
              className={`
                flex flex-col items-center justify-center gap-1 p-2.5 rounded-md transition-colors
                ${
                  layoutTool === "circle"
                    ? "bg-[hsl(var(--primary)/0.1)] border border-[hsl(var(--primary)/0.3)]"
                    : "hover:bg-[hsl(var(--muted)/0.5)] border border-[hsl(var(--border))]"
                }
              `}
            >
              <Circle
                className={`w-4 h-4 ${layoutTool === "circle" ? "text-[hsl(var(--primary))]" : "text-[hsl(var(--muted-foreground))]"}`}
              />
              <span className="text-[10px]">Circle</span>
            </button>

            {/* Square */}
            <button
              onClick={() =>
                setLayoutTool(layoutTool === "square" ? "select" : "square")
              }
              className={`
                flex flex-col items-center justify-center gap-1 p-2.5 rounded-md transition-colors
                ${
                  layoutTool === "square"
                    ? "bg-[hsl(var(--primary)/0.1)] border border-[hsl(var(--primary)/0.3)]"
                    : "hover:bg-[hsl(var(--muted)/0.5)] border border-[hsl(var(--border))]"
                }
              `}
            >
              <Square
                className={`w-4 h-4 ${layoutTool === "square" ? "text-[hsl(var(--primary))]" : "text-[hsl(var(--muted-foreground))]"}`}
              />
              <span className="text-[10px]">Square</span>
            </button>

            {/* Rectangle */}
            <button
              onClick={() =>
                setLayoutTool(
                  layoutTool === "rectangle" ? "select" : "rectangle",
                )
              }
              className={`
                flex flex-col items-center justify-center gap-1 p-2.5 rounded-md transition-colors
                ${
                  layoutTool === "rectangle"
                    ? "bg-[hsl(var(--primary)/0.1)] border border-[hsl(var(--primary)/0.3)]"
                    : "hover:bg-[hsl(var(--muted)/0.5)] border border-[hsl(var(--border))]"
                }
              `}
            >
              <RectangleHorizontal
                className={`w-4 h-4 ${layoutTool === "rectangle" ? "text-[hsl(var(--primary))]" : "text-[hsl(var(--muted-foreground))]"}`}
              />
              <span className="text-[10px]">Rectangle</span>
            </button>
          </div>
        </div>

        {/* Layout Elements List */}
        <div className="space-y-1.5">
          <div className="flex items-center justify-between">
            <label className="text-[10px] font-medium text-[hsl(var(--muted-foreground))] uppercase tracking-wide">
              Layout Elements ({shapes.length})
            </label>
            {shapes.length > 0 && (
              <button
                onClick={() => {
                  clearAllLayoutShapes();
                }}
                className="p-1 hover:bg-[hsl(var(--destructive)/0.1)] rounded transition-colors"
                title="Clear all shapes"
              >
                <Trash2 className="w-3 h-3 text-[hsl(var(--destructive))]" />
              </button>
            )}
          </div>
          {shapes.length > 0 ? (
            <div className="space-y-1 max-h-40 overflow-y-auto">
              {shapes.map((shape, index) => {
                const isTracedTool =
                  shape.type === "tool" || !!shape.toolOutlineId;
                const shapeIcon =
                  shape.type === "circle"
                    ? Circle
                    : shape.type === "square"
                      ? Square
                      : shape.type === "rectangle"
                        ? RectangleHorizontal
                        : shape.type === "finger-notch"
                          ? Hand
                          : Wrench; // Default for traced tools

                return (
                  <div
                    key={shape.id || index}
                    className="flex items-center gap-2 p-2 rounded-md border border-[hsl(var(--border))] hover:bg-[hsl(var(--muted)/0.3)] transition-colors"
                  >
                    <div className="w-4 h-4 flex items-center justify-center shrink-0">
                      {React.createElement(shapeIcon, {
                        className:
                          "w-3.5 h-3.5 text-[hsl(var(--muted-foreground))]",
                      })}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="text-xs font-medium text-[hsl(var(--foreground))] truncate">
                        {`${shape.type || "Shape"} ${index + 1}`}
                      </div>
                      <div className="text-[10px] text-[hsl(var(--muted-foreground))]">
                        {isTracedTool ? "Traced tool" : "Added shape"}
                      </div>
                    </div>
                    <button
                      onClick={() => {
                        if (shape.id && !isTracedTool) {
                          removeLayoutShape(shape.id);
                        }
                      }}
                      disabled={isTracedTool}
                      className="p-1 hover:bg-[hsl(var(--destructive)/0.1)] rounded transition-colors shrink-0 disabled:opacity-50 disabled:cursor-not-allowed"
                      title={
                        isTracedTool
                          ? "Cannot delete traced tools"
                          : "Remove shape"
                      }
                    >
                      <Trash2 className="w-3 h-3 text-[hsl(var(--destructive))]" />
                    </button>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="p-3 border border-dashed border-[hsl(var(--border))] rounded-lg text-center">
              <Shapes className="w-5 h-5 mx-auto mb-1.5 text-[hsl(var(--muted-foreground))] opacity-50" />
              <p className="text-[10px] text-[hsl(var(--muted-foreground))]">
                No layout elements yet. Add shapes or initialize from traced
                tools.
              </p>
            </div>
          )}
        </div>
      </div>

      {/* Layout Summary & CTA Button - Fixed at bottom */}
      <div className="pt-3 border-t border-[hsl(var(--border))] mt-3 space-y-3">
        {/* Layout Summary */}
        <div className="p-2.5 bg-[hsl(var(--muted)/0.3)] rounded-lg">
          <div className="grid grid-cols-3 gap-2 text-center">
            <div>
              <span className="text-xs font-medium">{shapes.length}</span>
              <p className="text-[9px] text-[hsl(var(--muted-foreground))]">
                Shapes
              </p>
            </div>
            <div>
              <span className="text-xs font-medium font-tech">
                {grid.cols}×{grid.rows}
              </span>
              <p className="text-[9px] text-[hsl(var(--muted-foreground))]">
                Grid
              </p>
            </div>
            <div>
              <span className="text-xs font-medium font-tech">
                {grid.cols * grid.cellWidthMm}mm
              </span>
              <p className="text-[9px] text-[hsl(var(--muted-foreground))]">
                Width
              </p>
            </div>
          </div>
        </div>

        <button
          onClick={() => setCurrentStep("design")}
          disabled={shapes.length === 0}
          className="
            w-full h-8 px-3 bg-[hsl(var(--primary))] text-[hsl(var(--primary-foreground))]
            rounded text-xs font-medium hover:bg-[hsl(var(--primary)/0.9)]
            transition-colors flex items-center justify-center gap-1.5
            disabled:opacity-50 disabled:cursor-not-allowed
          "
        >
          Continue
          <ChevronRight className="w-3 h-3" />
        </button>
      </div>
    </div>
  );
};

// ============================================================================
// 3D Design Step Panel (Placeholder)
// ============================================================================

const DesignStepPanel: React.FC = () => {
  const {
    layoutState,
    setCurrentStep,
    designSettings,
    updateDesignSettings,
    resetDesignSettings,
    toolOutlines,
  } = useAppStore();

  const { shapes } = layoutState;

  // Check prerequisites
  const hasTools = toolOutlines.length > 0;
  const hasLayout = shapes.length > 0;
  // const isDisabled = !hasTools || !hasLayout;
  const isDisabled = false;

  return (
    <div className="h-full flex flex-col">
      {/* Prerequisite Warning Banner */}
      {isDisabled && (
        <div className="mb-3 p-2.5 bg-[hsl(var(--warning)/0.1)] border border-[hsl(var(--warning)/0.2)] rounded-lg flex items-start gap-2">
          <AlertCircle className="w-4 h-4 text-[hsl(var(--warning))] shrink-0 mt-0.5" />
          <div className="text-[10px] text-[hsl(var(--warning))]">
            {!hasTools && <p>• Trace tools in step 2</p>}
            {!hasLayout && <p>• Configure layout in step 3</p>}
          </div>
        </div>
      )}

      {/* Scrollable Content */}
      <div
        className={`flex-1 overflow-y-auto space-y-4 ${isDisabled ? "opacity-60 pointer-events-none" : ""}`}
      >
        {/* Info */}
        <div className="p-2.5 bg-[hsl(var(--muted)/0.5)] rounded-lg">
          <div className="flex items-center justify-between">
            <p className="text-[10px] text-[hsl(var(--muted-foreground))]">
              Customize your 3D tool holder design parameters
            </p>
            <button
              onClick={resetDesignSettings}
              className="
                px-2 py-1 text-[10px] font-medium text-[hsl(var(--muted-foreground))]
                hover:text-[hsl(var(--foreground))] hover:bg-[hsl(var(--muted)/0.5)]
                rounded transition-colors flex items-center gap-1
              "
              title="Reset to default values"
            >
              <RefreshCw className="w-3 h-3" />
              Reset
            </button>
          </div>
        </div>

        {/* Depth Settings */}
        <div className="space-y-2">
          <label className="text-[10px] font-medium text-[hsl(var(--muted-foreground))] uppercase tracking-wide">
            Cutout Depth
          </label>
          <div className="space-y-1.5">
            <input
              type="range"
              min={5}
              max={50}
              step={1}
              value={designSettings.cutoutDepth}
              onChange={(e) =>
                updateDesignSettings({
                  cutoutDepth: parseFloat(e.target.value),
                })
              }
              className="w-full h-1.5 bg-[hsl(var(--muted))] rounded-lg appearance-none cursor-pointer accent-[hsl(var(--primary))]"
            />
            <div className="flex items-center justify-between">
              <span className="text-[10px] text-[hsl(var(--muted-foreground))]">
                5mm
              </span>
              <span className="text-xs font-medium font-tech">
                {designSettings.cutoutDepth}mm
              </span>
              <span className="text-[10px] text-[hsl(var(--muted-foreground))]">
                50mm
              </span>
            </div>
          </div>
        </div>

        {/* Base Height */}
        <div className="space-y-2">
          <label className="text-[10px] font-medium text-[hsl(var(--muted-foreground))] uppercase tracking-wide">
            Base Height
          </label>
          <div className="space-y-1.5">
            <input
              type="range"
              min={2}
              max={15}
              step={0.5}
              value={designSettings.baseHeight}
              onChange={(e) =>
                updateDesignSettings({ baseHeight: parseFloat(e.target.value) })
              }
              className="w-full h-1.5 bg-[hsl(var(--muted))] rounded-lg appearance-none cursor-pointer accent-[hsl(var(--primary))]"
            />
            <div className="flex items-center justify-between">
              <span className="text-[10px] text-[hsl(var(--muted-foreground))]">
                2mm
              </span>
              <span className="text-xs font-medium font-tech">
                {designSettings.baseHeight}mm
              </span>
              <span className="text-[10px] text-[hsl(var(--muted-foreground))]">
                15mm
              </span>
            </div>
          </div>
        </div>

        {/* Wall Thickness */}
        <div className="space-y-2">
          <label className="text-[10px] font-medium text-[hsl(var(--muted-foreground))] uppercase tracking-wide">
            Wall Thickness
          </label>
          <div className="space-y-1.5">
            <input
              type="range"
              min={1}
              max={5}
              step={0.5}
              value={designSettings.wallThickness}
              onChange={(e) =>
                updateDesignSettings({
                  wallThickness: parseFloat(e.target.value),
                })
              }
              className="w-full h-1.5 bg-[hsl(var(--muted))] rounded-lg appearance-none cursor-pointer accent-[hsl(var(--primary))]"
            />
            <div className="flex items-center justify-between">
              <span className="text-[10px] text-[hsl(var(--muted-foreground))]">
                1mm
              </span>
              <span className="text-xs font-medium font-tech">
                {designSettings.wallThickness}mm
              </span>
              <span className="text-[10px] text-[hsl(var(--muted-foreground))]">
                5mm
              </span>
            </div>
          </div>
        </div>

        {/* Chamfer Size */}
        <div className="space-y-2">
          <label className="text-[10px] font-medium text-[hsl(var(--muted-foreground))] uppercase tracking-wide">
            Edge Chamfer
          </label>
          <div className="space-y-1.5">
            <input
              type="range"
              min={0}
              max={5}
              step={0.5}
              value={designSettings.chamferSize}
              onChange={(e) =>
                updateDesignSettings({
                  chamferSize: parseFloat(e.target.value),
                })
              }
              className="w-full h-1.5 bg-[hsl(var(--muted))] rounded-lg appearance-none cursor-pointer accent-[hsl(var(--primary))]"
            />
            <div className="flex items-center justify-between">
              <span className="text-[10px] text-[hsl(var(--muted-foreground))]">
                0mm
              </span>
              <span className="text-xs font-medium font-tech">
                {designSettings.chamferSize}mm
              </span>
              <span className="text-[10px] text-[hsl(var(--muted-foreground))]">
                5mm
              </span>
            </div>
          </div>
        </div>

        {/* Gridfinity Base Toggle */}
        <div className="flex items-center justify-between p-2.5 border border-[hsl(var(--border))] rounded-lg">
          <div>
            <span className="text-xs font-medium">Gridfinity Base</span>
            <p className="text-[10px] text-[hsl(var(--muted-foreground))]">
              Add 42mm grid pattern
            </p>
          </div>
          <button
            onClick={() =>
              updateDesignSettings({
                gridfinityBase: !designSettings.gridfinityBase,
              })
            }
            className={`
              w-10 h-5 rounded-full transition-colors relative
              ${
                designSettings.gridfinityBase
                  ? "bg-[hsl(var(--primary))]"
                  : "bg-[hsl(var(--muted))]"
              }
            `}
          >
            <span
              className={`
                absolute top-0.5 w-4 h-4 rounded-full bg-white shadow transition-transform
                ${designSettings.gridfinityBase ? "left-5" : "left-0.5"}
              `}
            />
          </button>
        </div>
      </div>

      {/* Summary & CTA Button - Fixed at bottom */}
      <div className="pt-3 border-t border-[hsl(var(--border))] mt-3 space-y-3">
        {/* Design Summary */}
        <div className="p-2.5 bg-[hsl(var(--muted)/0.3)] rounded-lg">
          <div className="grid grid-cols-2 gap-2 text-center">
            <div>
              <span className="text-xs font-medium">{shapes.length}</span>
              <p className="text-[9px] text-[hsl(var(--muted-foreground))]">
                Cutouts
              </p>
            </div>
            <div>
              <span className="text-xs font-medium font-tech">
                {designSettings.cutoutDepth}mm
              </span>
              <p className="text-[9px] text-[hsl(var(--muted-foreground))]">
                Depth
              </p>
            </div>
          </div>
        </div>

        <button
          onClick={() => setCurrentStep("export")}
          disabled={shapes.length === 0}
          className="
            w-full h-8 px-3 bg-[hsl(var(--primary))] text-[hsl(var(--primary-foreground))]
            rounded text-xs font-medium hover:bg-[hsl(var(--primary)/0.9)]
            transition-colors flex items-center justify-center gap-1.5
            disabled:opacity-50 disabled:cursor-not-allowed
          "
        >
          Continue
          <ChevronRight className="w-3 h-3" />
        </button>
      </div>
    </div>
  );
};

// ============================================================================
// Main Control Panel
// ============================================================================

export const ControlPanel: React.FC = () => {
  const { currentStep } = useAppStore();

  return (
    <div className="h-full flex flex-col bg-[hsl(var(--card))]">
      {/* Step Content */}
      <div className="flex-1 overflow-hidden p-3">
        {currentStep === "paper" && <PaperStepPanel />}
        {currentStep === "tools" && <ToolsStepPanel />}
        {currentStep === "layout" && <LayoutStepPanel />}
        {currentStep === "design" && <DesignStepPanel />}
        {currentStep === "export" && <ExportStepPanel />}
      </div>
    </div>
  );
};
