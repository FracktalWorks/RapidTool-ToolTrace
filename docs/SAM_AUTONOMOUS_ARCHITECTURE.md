# Autonomous + Precise Detection — Architecture

> **Thesis:** Tool detection that is *both* autonomous (no clicking) *and*
> precise (pixel-accurate, chrome included) is achievable in a browser-only app
> with **no dataset, no training, no servers, and no API** — through exactly one
> design: **tool-tuned SAM Automatic Mask Generation on SlimSAM.** This document
> describes that working structure and proves why no other approach fits our
> constraints.

---

## 1. The Constraint Set (the hard boundaries)

Every design decision is forced by these. They are non-negotiable givens of the
product, accumulated and confirmed over the project:

| # | Constraint | Source |
|---|------------|--------|
| C1 | **No labeled dataset** | We have none and can't hand-label thousands |
| C2 | **No training compute budget** | Can't pay for GPU training |
| C3 | **No inference compute cost** | No server GPU — must be free at runtime |
| C4 | **No third-party API** | Nothing leaves the device; no keys |
| C5 | **Small / lazy delivery** | 30 MB+ eager download is unacceptable |
| C6 | **Autonomous** | Upload → all tools detected, no per-tool clicks |
| C7 | **Pixel precision, incl. chrome-on-white** | Classical proven insufficient (measured) |
| C8 | **Browser-only SaaS** | No backend exists; runs in the visitor's browser |

Hold these. Section 4 shows every alternative violates at least one — and the
chosen design violates none.

---

## 2. Working Structure (the 4-stage pipeline)

Every "upload → all objects segmented precisely" system on earth is the same
four stages. Only **Stage 1** differs between systems.

```
            ┌──────────────────────────────────────────────────────────┐
  photo ──► │  STAGE 0 · CALIBRATE   (existing)                        │
            │  Paper detection → pixels-per-mm + paper quad             │
            └──────────────────────────────────────────────────────────┘
                                   │
            ┌──────────────────────────────────────────────────────────┐
            │  STAGE 1 · PROPOSE   "where are the tools?"  (NEW)       │
            │  Hybrid, zero-training prompt generation:                 │
            │   a) classical blobs  → 1 box/point per coloured/dark tool│
            │   b) paper point-grid → catches CHROME classical misses   │
            └──────────────────────────────────────────────────────────┘
                                   │  (prompts)
            ┌──────────────────────────────────────────────────────────┐
            │  STAGE 2 · SEGMENT   (built — extend to batch)           │
            │  SlimSAM: encode image ONCE, then decode a mask per       │
            │  prompt (decoder is cheap → ~40 prompts in 1-3s)         │
            └──────────────────────────────────────────────────────────┘
                                   │  (N candidate masks + IoU scores)
            ┌──────────────────────────────────────────────────────────┐
            │  STAGE 3 · FILTER + DEDUPE   (NEW — the real engineering) │
            │  • per prompt: prefer the LARGEST plausible of SAM's 3     │
            │    candidate masks  → whole tool, not a part               │
            │  • keep: inside paper, area∈[tool range], solid, not≈sheet │
            │  • containment-aware NMS: drop masks largely inside another │
            │    (sub-parts) + IoU-NMS by SAM score → one mask per tool  │
            └──────────────────────────────────────────────────────────┘
                                   │  (clean set of tool masks)
            ┌──────────────────────────────────────────────────────────┐
            │  STAGE 4 · GEOMETRY   (existing — unchanged)            │
            │  each mask → contourFromMask (OpenCV) → smooth →         │
            │  Clipper offset → anchor-editing → CSG pockets → STL     │
            └──────────────────────────────────────────────────────────┘
                                   │
                                 outputs
```

### Component responsibilities

| Stage | Component | Status | Responsibility |
|-------|-----------|--------|----------------|
| 0 | `cvWorker.detectPaper` | ✅ exists | Paper quad + scale |
| 1a | `cvWorker.buildToolMask` blobs | ✅ exists | Locate coloured/dark tools (loose boundary is fine — only *position* is needed here) |
| 1b | point-grid generator | ➕ new | Even grid over paper interior to probe chrome SAM-able regions |
| 2 | `samWorker` (encode once + batch decode) | ⚙️ extend | Precise mask per prompt |
| 3 | mask filter + NMS | ➕ new | Keep tool-like masks, remove duplicates/sub-parts |
| 4 | `contourFromMask` + `geometry` + editing | ✅ exists | Mask → precise editable CAD outline |

**Design rule:** Stage 1 only needs to *locate* tools, not outline them — so
classical's weakness (loose boundaries) is irrelevant there. Stage 2 (SAM) owns
all precision. This is why the classical work we already built is *reused, not
wasted*: it becomes a free prompt generator.

### 2.1 Worked example — the multi-material screwdriver

A screwdriver is one object with many appearances: a **yellow handle**, **black
grip edges**, a **bright steel shaft** (top), **darker steel** (underside /
shadow), and **black edge faces**. This single case is the design's stress test:

| Approach | Result | Why |
|----------|--------|-----|
| Classical (color/threshold) | **Fragments** — yellow handle = one blob, bright shaft = *missed* (reads as paper), dark edges = another blob | It segments *colour regions*, not *objects*. It has no notion that these parts are one tool. |
| SAM (this design) | **One mask = the whole screwdriver** | Learned *objectness* groups handle + shaft + edges. The dark undersides/edges are *edge cues* that let it trace the bright shaft even where it blends into paper. |

The heterogeneity that **breaks** classical is exactly what SAM **resolves** —
multi-contrast is a help to a learned model, a hazard to a pixel-statistics one.

**Two nuances the pipeline must handle (both in Stage 3):**

1. **Granularity.** SAM emits 3 candidate masks per prompt — *part* (handle
   only), *sub-object*, *whole* (full screwdriver). Selecting by raw IoU can pick
   a part. → **Rule:** per prompt, choose the **largest mask that still passes
   the tool filters** (whole over part).
2. **Same tool, many prompts.** The grid may prompt the handle *and* the shaft →
   two masks of one screwdriver. → **Rule:** **containment-aware NMS** — if mask
   A lies largely inside mask B, A is a sub-part: drop it, keep the whole. Both
   prompts collapse to a single screwdriver outline.

**Residual hard case + fallback.** If a shaft is *perfectly* white with a truly
edgeless boundary against the paper, even SAM may clip it short. Mitigations, in
order: (a) the dark undersides usually prevent this; (b) the user can click/box
that specific tool (interactive SAM, already built); (c) the **anchor-editing**
tool lets them drag the boundary out in seconds. Autonomy gets it ~right; the
human-in-the-loop guarantees zero-loss on the rare exception.

---

## 3. Why This Is Literally SAM's Own "Segment Everything"

Meta's SAM demo achieves autonomous segmentation the same way: a regular grid of
points → a mask at each → non-max suppression by predicted IoU. We are not
inventing; we are **specialising** that proven recipe:
- grid is **bounded to the paper** (not the whole frame),
- filters are **tuned to tool size/solidity**,
- prompts are **seeded** by classical blobs so we spend fewer SAM passes.

It is the textbook autonomous-SAM pattern, sized for our problem.

---

## 4. Why ONLY This Approach Fits — the Elimination Proof

This is not preference. Each candidate is killed by a specific hard constraint.

| Approach | C1 data | C2 train | C3 infer$ | C4 API | C5 size | C6 auto | C7 chrome | Verdict |
|----------|:--:|:--:|:--:|:--:|:--:|:--:|:--:|---------|
| Pure classical (threshold/GrabCut) | ✅ | ✅ | ✅ | ✅ | ✅ | ⚠️ | ❌ | **Dies on C7** — proven to miss chrome |
| Train YOLO-seg **now** | ❌ | ❌ | ✅ | ✅ | ✅ | ✅ | ✅ | **Dies on C1+C2** — no data, no train budget |
| Cloud SAM / detection **API** | ✅ | ✅ | ❌ | ❌ | ✅ | ✅ | ✅ | **Dies on C3+C4** |
| Self-hosted GPU inference | ✅ | ✅ | ❌ | ✅ | ✅ | ✅ | ✅ | **Dies on C3+C8** — needs a backend |
| Open-vocab detector (Grounding DINO / YOLO-World) + SAM | ✅ | ✅ | ✅ | ✅ | ❌ | ✅ | ✅ | **Dies on C5** — 100s of MB in-browser |
| Full SAM (ViT-H) AMG | ✅ | ✅ | ✅ | ✅ | ❌ | ✅ | ✅ | **Dies on C5** — ~2.5 GB |
| Interactive click-SAM (we built it) | ✅ | ✅ | ✅ | ✅ | ✅ | ❌ | ✅ | **Dies on C6** — one click per tool |
| **SAM-AMG on SlimSAM (this doc)** | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | **Survives all 8** |

**The intersection of all eight constraints contains exactly one survivor.**
Not because it is the cleverest — because every other option provably exits on a
constraint you have declared non-negotiable:

- Anything **trained** → exits on **C1/C2** (no data, no budget).
- Anything **cloud/server** → exits on **C3/C4/C8** (cost, API, no backend).
- Anything **big-model** → exits on **C5** (delivery).
- Anything **classical-only** → exits on **C7** (chrome, measured).
- **Click-SAM** → exits on **C6** (not autonomous).

SlimSAM-AMG is the *only* design that is simultaneously trainless, dataless,
serverless, API-free, small, autonomous, **and** precise. That is the whole
argument — it is the unique point where your constraints all hold at once.

---

## 5. Why It's Also the Right *Long-Term* Bet

This isn't a dead-end hack; it's the on-ramp to the eventual fast model:

```
SlimSAM-AMG (now)  ──►  every autonomous mask is a free (image, mask) label
                   ──►  labels accumulate from real usage  (dataset, $0)
                   ──►  later: train YOLO-seg ONCE on them  (one-time, cheap)
                   ──►  YOLO-seg becomes Stage 1 (tiny ~6MB, real-time, owned)
                   ──►  SlimSAM stays as the rare/new-tool fallback
```

The architecture above doesn't change — only **Stage 1's proposer** is swapped
(grid → trained detector) once the flywheel has paid for the data. We build the
pipeline once; it carries us from zero-data today to a tiny owned model later.

---

## 5.1 Locked Engineering Decisions (model + runtime)

Confirmed after reviewing `lucasgelfond/webgpu-sam2` (SAM2 via onnxruntime-web +
WebGPU). That repo validates the encode-once / decode-per-prompt split and the
WebGPU direction, but it also drove three decisions for us:

1. **Base model = SlimSAM via transformers.js — not raw ORT / SAM2.**
   The reference repo had to switch **off Vite to Webpack** for the WebGPU
   bundle. We stay on Vite; transformers.js wraps onnxruntime-web and already
   runs under Vite. SAM2 encoders are also ~100 MB+ (vs SlimSAM q8 ~10 MB),
   violating C5. SlimSAM is the Phase-1 base.
2. **WebGPU is a best-effort accelerator, never a dependency.** transformers.js
   `device: 'webgpu'` is attempted; **WASM is the guaranteed path** (works on
   Vite today). Autonomy must be acceptable on WASM.
3. **SAM2-via-WebGPU is the future "Detail mode"**, pluggable behind the same
   Stage 1–4 pipeline. The reference repo is our map for that upgrade — later,
   not Phase 1.

## 5.2 Performance Refinement — classical-seeded *sparse* prompting

A blind dense grid (~40 prompts) is ~8–10 s on WASM — too slow. Classical isn't
only a seed; it **cuts SAM's workload**:

```
classical locates MOST tools instantly (free)  → SAM precise-masks those
        +  a SPARSE grid ONLY over paper areas classical left UNCOVERED (chrome)
        →  ~15 decodes instead of ~40  →  ~2-4 s, WebGPU-optional
```

So Stage 1 builds a **coverage mask** from classical blobs and only drops grid
points where coverage is empty (the metal classical can't see). SAM spends
passes exactly where classical is uncertain — nowhere else.

## 6. What To Build Next (concrete)

1. `samWorker.autoSegment(imageUrl, paperCorners)`:
   embed once → hybrid prompts (classical blobs ∪ paper grid) → batch decode →
   return N masks + IoU scores.
2. Stage 3 filter/NMS (in worker or manager): tool-size + solidity + paper-bounds
   + IoU-ranked mask non-max suppression.
3. Each surviving mask → existing `contourFromMask` → `createToolOutline`.
4. UI: a single **"Detect All — AI"** action; classical "Auto Detect" stays as
   the instant, no-download option.

Everything downstream (Stage 4) already exists and is reused verbatim.
