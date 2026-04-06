import { readFileSync, writeFileSync } from 'fs';

let content = readFileSync('./src/lib/geometry.ts', 'utf8');

const pillFunc = `
// Fit an oriented pill shape (capsule) to the given points
export const createPillShape = (pts: Point2D[]): Point2D[] => {
  if (pts.length < 3) return [...pts];
  
  // 1. Find the two furthest points (A and B) which define the spine.
  let maxDist = 0;
  let A = pts[0], B = pts[0];
  for (let i = 0; i < pts.length; i++) {
    for (let j = i + 1; j < pts.length; j++) {
      const d = Math.hypot(pts[i].x - pts[j].x, pts[i].y - pts[j].y);
      if (d > maxDist) { maxDist = d; A = pts[i]; B = pts[j]; }
    }
  }
  
  // 2. Center axis and normal
  const dx = B.x - A.x;
  const dy = B.y - A.y;
  const len = Math.hypot(dx, dy);
  if (len === 0) return [...pts];
  const D = { x: dx / len, y: dy / len };
  const N = { x: -D.y, y: D.x };
  
  // 3. Find max perpendicular distance (Radius)
  let R = 0;
  for (const P of pts) {
    const perp = Math.abs((P.x - A.x) * N.x + (P.y - A.y) * N.y);
    if (perp > R) R = perp;
  }
  
  // 4. Inset spine endpoints by R to leave room for semicircular caps
  let centerA = { x: A.x + D.x * R, y: A.y + D.y * R };
  let centerB = { x: B.x - D.x * R, y: B.y - D.y * R };
  
  // If the object is too short/fat, just make a circle at the midpoint
  if (len < 2 * R) {
    centerA = centerB = { x: (A.x + B.x) / 2, y: (A.y + B.y) / 2 };
    R = maxDist / 2;
  }
  
  // 5. Build the pill path
  const pillPts: Point2D[] = [];
  const stepsPerCap = 20;
  
  // Right side line (from B to A logic)
  pillPts.push({ x: centerB.x + N.x * R, y: centerB.y + N.y * R });
  pillPts.push({ x: centerA.x + N.x * R, y: centerA.y + N.y * R });
  
  // Cap at A
  for (let i = 1; i < stepsPerCap; i++) {
    const angle = i * Math.PI / stepsPerCap;
    // We rotate N by angle. 
    // Normal is angle 0. D is angle -PI/2 ? Wait. 
    // Let's just use cosine and sine blending between N and -D and -N.
    // At 0 it's N. At PI/2 it's -D. At PI it's -N.
    const cos = Math.cos(angle);
    const sin = Math.sin(angle);
    pillPts.push({
      x: centerA.x + R * (N.x * cos - D.x * sin),
      y: centerA.y + R * (N.y * cos - D.y * sin)
    });
  }
  
  // Left side line
  pillPts.push({ x: centerA.x - N.x * R, y: centerA.y - N.y * R });
  pillPts.push({ x: centerB.x - N.x * R, y: centerB.y - N.y * R });
  
  // Cap at B
  for (let i = 1; i < stepsPerCap; i++) {
    const angle = i * Math.PI / stepsPerCap;
    const cos = Math.cos(angle);
    const sin = Math.sin(angle);
    // Rotating from -N at 0, through D at PI/2, to N at PI
    pillPts.push({
      x: centerB.x + R * (-N.x * cos + D.x * sin),
      y: centerB.y + R * (-N.y * cos + D.y * sin)
    });
  }
  
  return pillPts;
};
`;

content = content + '\n' + pillFunc;
writeFileSync('./src/lib/geometry.ts', content);

let storeContent = readFileSync('./src/stores/appStore.ts', 'utf8');
storeContent = storeContent.replace(
  '  selectOutline: (id: string | null) => void;',
  '  selectOutline: (id: string | null) => void;\n  snapToPill: (id: string) => void;'
);

const snapFunc = `
  snapToPill: (id) => set((state) => {
    return {
      toolOutlines: state.toolOutlines.map((o) => {
        if (o.id !== id) return o;
        // Apply the geometric pill algorithm
        import('../lib/geometry').then(({ createPillShape }) => {
          const pillPts = createPillShape(o.points);
          // Update it asynchronously
          get().updateToolOutline(id, pillPts);
        });
        return o;
      })
    };
  }),
`;

storeContent = storeContent.replace(
  /  selectOutline: \(id\) => set\(\{ selectedOutlineId: id \}\),/,
  '  selectOutline: (id) => set({ selectedOutlineId: id }),\n' + snapFunc
);
writeFileSync('./src/stores/appStore.ts', storeContent);

