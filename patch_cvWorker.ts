import { readFileSync, writeFileSync } from 'fs';

let content = readFileSync('./src/workers/cvWorker.ts', 'utf8');

const applyMaskFunc = `
// Apply paper mask to ignore background
function applyPaperMask(src: any, paperCorners?: PaperCorners | null) {
  if (!paperCorners) return src;
  const mask = new cv.Mat.zeros(src.rows, src.cols, cv.CV_8UC1);
  const pts = cv.matFromArray(4, 1, cv.CV_32SC2, [
    Math.round(paperCorners.topLeft.x), Math.round(paperCorners.topLeft.y),
    Math.round(paperCorners.topRight.x), Math.round(paperCorners.topRight.y),
    Math.round(paperCorners.bottomRight.x), Math.round(paperCorners.bottomRight.y),
    Math.round(paperCorners.bottomLeft.x), Math.round(paperCorners.bottomLeft.y)
  ]);
  const ptsVector = new cv.MatVector();
  ptsVector.push_back(pts);
  cv.fillPoly(mask, ptsVector, new cv.Scalar(255));
  const whiteBg = new cv.Mat(src.rows, src.cols, src.type(), new cv.Scalar(255, 255, 255, 255));
  src.copyTo(whiteBg, mask);
  src.delete();
  pts.delete(); ptsVector.delete(); mask.delete();
  return whiteBg;
}
`;

// Add applyPaperMask before traceTool
content = content.replace(
  '// Tool Tracing (Paper-is-White Silhouette Strategy)',
  applyMaskFunc + '\n// Tool Tracing (Paper-is-White Silhouette Strategy)'
);

// Update traceTool signature and apply mask
content = content.replace(
  /function traceTool\(imageData: ImageData, clickX: number, clickY: number\)/,
  'function traceTool(imageData: ImageData, clickX: number, clickY: number, paperCorners?: PaperCorners | null)'
);
content = content.replace(
  /const src = cv\.matFromImageData\(imageData\);/,
  'let src = cv.matFromImageData(imageData);\n  src = applyPaperMask(src, paperCorners);'
);

// Update traceAllTools signature and apply mask
content = content.replace(
  /function traceAllTools\(imageData: ImageData\): \{ points: Point2D\[\]; area: number \}\[\] \{/,
  'function traceAllTools(imageData: ImageData, paperCorners?: PaperCorners | null): { points: Point2D[]; area: number }[] {'
);
content = content.replace(
  /const src = cv\.matFromImageData\(imageData\);\s*\n\s*\/\/ Use the paper silhouette strategy/m,
  'let src = cv.matFromImageData(imageData);\n  src = applyPaperMask(src, paperCorners);\n  \n  // Use the paper silhouette strategy'
);

// Optimize bounding boxes in morphology to be tighter
content = content.replace(
  /const kernel = cv\.getStructuringElement\(cv\.MORPH_ELLIPSE, new cv\.Size\(7, 7\)\);/g,
  'const kernel = cv.getStructuringElement(cv.MORPH_ELLIPSE, new cv.Size(3, 3));'
);
content = content.replace(
  /const largeKernel = cv\.getStructuringElement\(cv\.MORPH_ELLIPSE, new cv\.Size\(15, 15\)\);/g,
  'const largeKernel = cv.getStructuringElement(cv.MORPH_ELLIPSE, new cv.Size(5, 5));'
);

// Pass payload.paperCorners in message handler
content = content.replace(
  /result = traceTool\(payload\.imageData, payload\.x, payload\.y\);/,
  'result = traceTool(payload.imageData, payload.x, payload.y, payload.paperCorners);'
);
content = content.replace(
  /result = traceAllTools\(payload\.imageData\);/,
  'result = traceAllTools(payload.imageData, payload.paperCorners);'
);

writeFileSync('./src/workers/cvWorker.ts', content);
