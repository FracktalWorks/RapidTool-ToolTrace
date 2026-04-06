import { readFileSync, writeFileSync } from 'fs';

let content = readFileSync('./src/workers/cvWorker.ts', 'utf8');

// 1. Lower epsilon to perfectly hug curves without cutting corners
content = content.replace(
  /const epsilon = 0\.015 \* peri;/,
  'const epsilon = 0.005 * peri;'
);

// 2. Add dilation to traceByPaperSilhouette to cover reflection gaps
content = content.replace(
  '  cv.morphologyEx(toolMask, toolMask, cv.MORPH_CLOSE, largeKernel);',
  '  cv.morphologyEx(toolMask, toolMask, cv.MORPH_CLOSE, largeKernel);\n  \n  // PUSH BOUNDARY OUT to cover the inner reflections and gapped glares on the edge\n  const dilateKernel = cv.getStructuringElement(cv.MORPH_ELLIPSE, new cv.Size(9, 9));\n  cv.dilate(toolMask, toolMask, dilateKernel);'
);

// 3. Add dilation to traceAllTools
content = content.replace(
  '  cv.morphologyEx(toolMask, toolMask, cv.MORPH_CLOSE, largeKernel); // from traceAllTools',
  '  cv.morphologyEx(toolMask, toolMask, cv.MORPH_CLOSE, largeKernel);\n  \n  const dilateKernel = cv.getStructuringElement(cv.MORPH_ELLIPSE, new cv.Size(9, 9));\n  cv.dilate(toolMask, toolMask, dilateKernel);'
); // Actually I'll just regex it safely:

content = content.replace(
  /cv\.morphologyEx\(toolMask, toolMask, cv\.MORPH_CLOSE, largeKernel\);/g,
  'cv.morphologyEx(toolMask, toolMask, cv.MORPH_CLOSE, largeKernel);\n  const dilateKernel = cv.getStructuringElement(cv.MORPH_ELLIPSE, new cv.Size(9, 9));\n  cv.dilate(toolMask, toolMask, dilateKernel);'
);

// 4. Cleanup dilateKernel
content = content.replace(
  /deleteMats\(gray, lighting, grayFloat, lightingFloat, epsilon, normalized, normalizedU8, toolMask, kernel, largeKernel, contours, hierarchy\);/g,
  'deleteMats(gray, lighting, grayFloat, lightingFloat, epsilon, normalized, normalizedU8, toolMask, kernel, largeKernel, dilateKernel, contours, hierarchy);'
);

writeFileSync('./src/workers/cvWorker.ts', content);

let geomContent = readFileSync('./src/lib/geometry.ts', 'utf8');
// Lower Chaikin to prevent shrinking
geomContent = geomContent.replace(
  /const smoothed = chaikinSmooth\(pts, 5\);/,
  'const smoothed = chaikinSmooth(pts, 2);'
);
writeFileSync('./src/lib/geometry.ts', geomContent);
