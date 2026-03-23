# ToolTrace Design System

## 1. Design Philosophy

### Overall UI Personality
- **Professional Technical** - Clean, precision-focused industrial design
- **CAD/Engineering Software** - Optimized for technical users and complex workflows
- **Modern Enterprise** - Contemporary aesthetics with functional priority

### Target User Feeling
- **Trust & Reliability** - Solid, dependable engineering tool
- **Precision & Clarity** - Clear hierarchy, technical accuracy
- **Professional Efficiency** - Streamlined workflow, minimal distraction
- **Technical Competence** - Sophisticated but accessible

### Visual DNA
- Glass morphism with technical gradients
- Subtle shadows and glows for depth
- Monospace elements for technical precision
- Clean geometric forms with rounded corners (12px radius)

---

## 2. Color System

### Primary Colors
- **Primary**: `hsl(198, 89%, 50%)` - Professional blue (main CTA, active states)
- **Primary Foreground**: `hsl(210, 40%, 98%)` - High contrast text on primary

### Secondary & Accent Colors  
- **Secondary**: `hsl(210, 40%, 96%)` - Subtle background tint
- **Accent**: `hsl(27, 96%, 61%)` - Warm orange (highlights, brand accent)

### Neutral Colors
- **Background**: `hsl(0, 0%, 100%)` (light) / `hsl(220, 13%, 8%)` (dark)
- **Foreground**: `hsl(222.2, 84%, 4.9%)` (light) / `hsl(210, 40%, 98%)` (dark)
- **Muted**: `hsl(210, 40%, 96%)` (light) / `hsl(220, 13%, 16%)` (dark)
- **Border**: `hsl(214.3, 31.8%, 91.4%)` (light) / `hsl(220, 13%, 18%)` (dark)

### Status Colors
- **Success**: `hsl(142, 76%, 47%)` - Green for positive actions
- **Warning**: `hsl(47, 96%, 53%)` - Amber for warnings  
- **Destructive**: `hsl(0, 84.2%, 60.2%)` - Red for danger/delete
- **Info**: Uses primary blue for informational states

### 3D Viewer Specific Colors
- **Viewer Background**: `hsl(210, 40%, 98%)` (light) / `hsl(220, 13%, 6%)` (dark)
- **Grid Lines**: `hsl(214.3, 31.8%, 91.4%)` (light) / `hsl(220, 13%, 20%)` (dark)
- **Axis Colors**:
  - X-Axis: `hsl(0, 84%, 60%)` - Red
  - Y-Axis: `hsl(120, 84%, 50%)` - Green  
  - Z-Axis: `hsl(240, 84%, 60%)` - Blue

### Usage Rules
- Primary blue for main actions, selections, focus states
- Accent orange sparingly for brand elements and highlights
- Neutral grays for UI structure, borders, secondary text
- Status colors only for their specific semantic purposes
- 3D axis colors follow industry convention (RGB = XYZ)

---

## 3. Typography

### Font Families
- **Primary**: System UI stack: `system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif`
- **Monospace**: Technical stack: `'SF Mono', 'Monaco', 'Inconsolata', 'Roboto Mono', 'Consolas', monospace`
- **Brand**: `'Thuast'` - Custom font for logo only
- **Alt Brand**: `'RealityHyper'` - Secondary brand font

### Font Sizes (Reduced by 2px from Tailwind defaults)
- **xs**: `10px` (0.625rem) - Micro labels, technical annotations
- **sm**: `12px` (0.75rem) - Small labels, secondary text
- **base**: `14px` (0.875rem) - Body text, form inputs
- **lg**: `16px` (1rem) - Emphasis text
- **xl**: `18px` (1.125rem) - Large text
- **2xl**: `22px` (1.375rem) - Small headings
- **3xl**: `26px` (1.625rem) - Medium headings
- **4xl**: `32px` (2rem) - Large headings

### Font Weights
- **Normal**: 400 - Body text
- **Medium**: 500 - Subtle emphasis
- **Semibold**: 600 - Strong emphasis, card titles
- **Bold**: 700 - Headings, important labels

### Heading Hierarchy
- **H1**: `text-4xl font-bold` (32px, bold) - Page titles
- **H2**: `text-3xl font-semibold` (26px, semibold) - Section headers  
- **H3**: `text-2xl font-semibold` (22px, semibold) - Card titles
- **H4**: `text-xl font-medium` (18px, medium) - Sub-sections
- **H5**: `text-lg font-medium` (16px, medium) - Component labels
- **H6**: `text-base font-medium` (14px, medium) - Minor headings

### Technical Text Style
- **Class**: `font-tech` 
- **Properties**: `font-variant-numeric: tabular-nums` for aligned numbers
- **Usage**: Technical measurements, coordinates, numerical data

---

## 4. Spacing & Layout

### Base Spacing Unit
- **Base unit**: `4px` (0.25rem) - All spacing derives from this
- **Common increments**: 4px, 8px, 12px, 16px, 20px, 24px, 32px, 48px

### Component Padding Patterns
- **Button**: `px-4 py-2` (16px horizontal, 8px vertical)
- **Button Small**: `px-3 py-2` (12px horizontal, 8px vertical)  
- **Button Icon**: `p-0` with `w-10 h-10` (40px square)
- **Card**: `p-6` (24px all sides)
- **Card Header**: `p-6` (24px all sides)
- **Card Content**: `p-6 pt-0` (24px horizontal/bottom, 0 top)
- **Input**: `px-3 py-2` (12px horizontal, 8px vertical)

### Component Heights
- **Button Default**: `h-10` (40px)
- **Button Small**: `h-9` (36px)  
- **Button Large**: `h-11` (44px)
- **Input**: `h-10` (40px)
- **Number Input**: `min-height: 28px` (for spinner buttons)

### Border Radius
- **Primary radius**: `0.75rem` (12px) - Cards, modals, major components
- **Button/Input**: `rounded-md` (6px) - Interactive elements
- **Badge**: `rounded-full` - Pills and status indicators
- **Small elements**: `rounded` (4px) - Minor components

### Container System
- **Max width**: `1400px` for 2xl screens
- **Container padding**: `2rem` (32px)
- **Container centering**: `center: true`

---

## 5. UI Components Style

### Buttons

#### Primary Button
```css
bg-primary text-primary-foreground hover:bg-primary/90
h-10 px-4 py-2 rounded-md font-medium text-sm
transition-colors focus-visible:outline-none focus-visible:ring-2
```

#### Secondary Button  
```css
bg-secondary text-secondary-foreground hover:bg-secondary/80
h-10 px-4 py-2 rounded-md font-medium text-sm
```

#### Outline Button
```css
border border-input bg-background hover:bg-accent hover:text-accent-foreground
h-10 px-4 py-2 rounded-md font-medium text-sm
```

#### Ghost Button
```css
hover:bg-accent hover:text-accent-foreground
h-10 px-4 py-2 rounded-md font-medium text-sm
```

#### Disabled State
```css
disabled:pointer-events-none disabled:opacity-50
```

### Inputs & Forms
```css
/* Standard Input */
h-10 w-full rounded-md border border-input bg-background px-3 py-2
text-base md:text-sm ring-offset-background
focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring
```

### Cards
```css
/* Card Container */
rounded-lg border bg-card text-card-foreground shadow-sm

/* Card Header */
flex flex-col space-y-1.5 p-6

/* Card Title */  
text-2xl font-semibold leading-none tracking-tight

/* Card Content */
p-6 pt-0
```

### Badges
```css
/* Default Badge */
inline-flex items-center rounded-full border px-2.5 py-0.5 
text-xs font-semibold bg-primary text-primary-foreground
```

### Technical Glass Effect
```css
/* Tech Glass */
background: var(--gradient-glass);
backdrop-filter: blur(12px);
border: 1px solid hsl(var(--border));
```

---

## 6. Interaction & Motion

### Hover States
- **Buttons**: Color opacity reduction (`/90` for primary, `/80` for secondary)
- **Ghost elements**: Background tint (`hover:bg-accent`)
- **Tech glow**: `box-shadow: var(--shadow-glow)` for special elements

### Focus States
```css
focus-visible:outline-none 
focus-visible:ring-2 
focus-visible:ring-ring 
focus-visible:ring-offset-2
```

### Active/Pressed States
- **Toolbar buttons**: `bg-primary/15 text-primary border border-primary/20`
- **Selection**: `aria-pressed` attribute for state

### Transitions
- **Standard**: `transition-colors` (color changes only)
- **Smooth**: `--transition-smooth: all 0.3s cubic-bezier(0.4, 0, 0.2, 1)`
- **Tech**: `--transition-tech: all 0.2s cubic-bezier(0.25, 0.46, 0.45, 0.94)`

### Animations
- **Spin (smooth)**: `animation: spin-smooth 1s linear infinite`
- **Pulse (tech)**: `animation: pulse-tech 2s cubic-bezier(0.4, 0, 0.6, 1) infinite`

### Loading States
```css
/* Loading Spinner */
w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin-smooth

/* Loading Overlay */
absolute inset-0 bg-background/20 backdrop-blur-sm
flex items-center justify-center
```

---

## 7. Accessibility & Usability

### Contrast Rules
- Text on background meets WCAG AA (4.5:1 minimum)
- Interactive elements have clear visual distinction
- Focus indicators are clearly visible

### Font Sizing Rules
- **Minimum text size**: 10px for technical annotations
- **Standard body**: 14px (reduced from 16px for density)
- **Touch targets**: Minimum 40px (h-10) for interactive elements

### Focus Indicators
- **Ring style**: 2px solid primary color with 2px offset
- **Visible on**: `focus-visible` only (not mouse clicks)
- **Color**: Uses `--ring` token (primary blue)

### Semantic Markup
- Proper `aria-label`, `aria-pressed` attributes
- Button roles and state indicators
- Semantic heading hierarchy

---

## 8. Design Rules for New Apps

### Must Stay Consistent

#### Colors
- **DO** use the exact HSL color tokens defined above
- **DO** maintain light/dark theme parity
- **DON'T** introduce new primary colors
- **DON'T** use colors outside the defined status palette

#### Typography
- **DO** use system font stack for UI elements  
- **DO** maintain the reduced font scale (14px base instead of 16px)
- **DO** use `font-tech` class for technical/numerical data
- **DON'T** mix additional font families in UI

#### Spacing
- **DO** use 4px base unit for all spacing
- **DO** maintain consistent component padding (buttons: px-4 py-2)
- **DON'T** introduce arbitrary spacing values

#### Interactive Elements
- **DO** use standard focus ring styles
- **DO** maintain transition timing and easing curves
- **DON'T** remove accessibility features

### What Can Vary Slightly

#### Layout Structure
- **CAN** rearrange toolbar position (left/right)
- **CAN** adjust sidebar widths for content needs
- **CAN** customize grid layouts within containers

#### Component Composition  
- **CAN** combine UI components in new ways
- **CAN** add domain-specific content inside standard layouts
- **CAN** extend component variants following established patterns

#### Technical Elements
- **CAN** customize 3D viewer settings (grid, axes) for domain needs
- **CAN** adjust technical color coding for different axis systems
- **CAN** modify loading states for domain-specific operations

### Application-Specific Adaptations
- **Workflow steps**: Define your own tool/step identifiers
- **Component categories**: Create domain-specific entity types  
- **Status messages**: Customize text for your domain
- **Icon choices**: Select appropriate Lucide icons for your tools

### Usage Examples

#### Compliant New Button
```tsx
<Button 
  variant="primary" 
  size="default"
  className="tech-transition"
>
  Your Action
</Button>
```

#### Compliant Color Usage
```css
/* DO - Use semantic tokens */
bg-primary text-primary-foreground

/* DON'T - Use arbitrary colors */
bg-blue-500 text-white
```

#### Compliant Font Usage
```tsx
<span className="font-tech text-sm tabular-nums">
  42.5mm
</span>
```

---

**Design System Status**: Created for ToolTracev0.0.0  
**Last Updated**: January 2026  
**Consistency Level**: High - All tokens and patterns are observable in current implementation