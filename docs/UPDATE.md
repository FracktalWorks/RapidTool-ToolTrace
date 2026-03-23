# ToolTrace Edge Detection Upgrade Strategy

## Current Status
We are already using **OpenCV.js (v4.9.0)** and currently achieving **~70–80%** edge detection accuracy.

## Goal
Push this closer to **90%+**, especially for:
- Paper detection (A4)
- Tool trace detection

## Approach
This upgrade must be **strategy-based**, not brute-force.
Apply techniques only where they improve accuracy.

## ⚠️ Important Constraints

| Constraint | Value |
|------------|--------|
| **Language** | JavaScript |
| **Library** | OpenCV.js v4.9.0 |
| **Environment** | Browser (WASM) |

> **Note:** Code snippets provided below are conceptual references only — adapt them properly to OpenCV.js APIs.

## 🎯 Core Assumptions (Very Important)

Our app always works with the following assumptions:

- ✅ **A4 sheet** is the standard paper size
- ✅ **Paper is white**
- ✅ **Tools are NOT white**
- ✅ **Background noise** can be ignored compared to paper brightness
- ✅ **Accuracy matters more than speed** (but avoid unnecessary passes)

> **Strategy:** Use these assumptions intelligently to improve results.

## 🧠 Required Strategy Improvements

### 1️⃣ Contrast Enhancement (Use CLAHE only if needed)

**Objective:** Improve local contrast before any edge detection.

**Steps:**
1. Convert to grayscale
2. Apply CLAHE to handle uneven lighting
3. Tune `clipLimit` and `tileGridSize` for browser performance

**📌 Goal:** Make tool edges pop without amplifying noise.

---

### 2️⃣ Edge-Preserving Noise Reduction

**Objective:** Instead of Gaussian blur, prefer bilateral filtering when edge precision matters.

**When to use:**
- ✅ Use bilateral filtering only for tool detection
- ❌ Skip or reduce blur for paper detection if edges are already strong

**📌 Goal:** Reduce noise without rounding tool edges.

---

### 3️⃣ Smart Thresholding (Paper-Aware)

**Objective:** Because the paper is white and dominant:

**Strategy:**
- Use adaptive or hybrid thresholding
- Bias thresholding logic toward detecting bright regions as paper
- Extract paper first, then focus tool detection inside paper bounds

**Example concept:**
```javascript
adaptiveThreshold(
  grayOrBlurred,
  255,
  ADAPTIVE_THRESH_GAUSSIAN_C,
  THRESH_BINARY,
  blockSize,
  C
)
```

**📌 Goal:** Clean paper mask → cleaner tool edges.

---

### 4️⃣ Intelligent Edge Detection (Auto-Tuned Canny)

**Objective:** Avoid fixed Canny thresholds.

**Strategy:**
- Compute thresholds dynamically based on image statistics
- Use median-based tuning logic
- Adjust sensitivity differently for:
  - Paper edges
  - Tool edges

**Conceptual reference:**
```javascript
median = computeMedian(blurred);
lower = clamp(0.66 * median);
upper = clamp(1.33 * median);
Canny(blurred, lower, upper);
```

**📌 Goal:** Stable edges across lighting variations.

---

### 5️⃣ Morphological Repair (Critical)

**Objective:** After edge detection:

**Steps:**
1. Use `MORPH_CLOSE` to fix broken edges
2. Light dilation to strengthen contours
3. Avoid aggressive kernels (browser performance + distortion)

**📌 Goal:** One clean, continuous contour per object.

---

### 6️⃣ Contour Selection Logic (Accuracy > Quantity)

**Objective:** Do NOT trust all contours.

**Filter by:**
- Area
- Solidity
- Aspect ratio

**Expected results:**
- One large contour → paper
- Inner contours → tools

**📌 Goal:** Reject noise early.

---

### 7️⃣ Tool Trace Precision

**Objective:** For tool contours:

**Requirements:**
- Use tighter contour approximation (epsilon)
- Preserve curvature
- Avoid over-simplification

**📌 Goal:** Better 3D extrusion accuracy later.

## 🧪 Evaluation Rules

**After applying upgrades:**

| Evaluation Criteria | Action |
|---------------------|--------|
| Compare before/after edge maps | ✅ |
| Measure contour completeness | ✅ |
| Prefer stable results over aggressive detection | ✅ |
| If a step does not improve output | ❌ Remove it |

---

## 🚫 Do NOT

- ❌ Blindly apply all steps
- ❌ Use Python-only APIs
- ❌ Use fixed thresholds everywhere
- ❌ Optimize prematurely at the cost of accuracy

---

## ✅ Final Goal

Produce a clean binary mask + continuous contours that:

- ✅ **Accurately represent A4 paper boundaries**
- ✅ **Capture tool edges with minimal loss**
- ✅ **Are suitable for precise 3D extrusion (Gridfinity)**