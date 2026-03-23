/**
 * Export Module Types
 * 
 * Types for fixture export functionality.
 * 
 * @module @rapidtool/cad-core/export
 */

import type * as THREE from 'three';

/**
 * Supported export file formats
 */
export type ExportFormat = 'stl' | '3mf' | 'obj';

/**
 * Export options for STL format
 */
export interface STLExportOptions {
  /** Use binary format (smaller file size) */
  binary?: boolean;
}

/**
 * A single exportable fixture part
 */
export interface ExportablePart {
  /** Unique identifier */
  id: string;
  /** Display name for the part */
  name: string;
  /** The mesh to export */
  mesh: THREE.Mesh;
  /** Section index for multi-section baseplates */
  sectionIndex?: number;
}

/**
 * Export configuration
 */
export interface ExportConfig {
  /** Base filename (without extension) */
  filename: string;
  /** Export format */
  format: ExportFormat;
  /** Whether to split parts into separate files (for multi-section) */
  splitParts: boolean;
  /** Format-specific options */
  options?: STLExportOptions;
}

/**
 * Result of an export operation
 */
export interface ExportResult {
  /** Whether the export was successful */
  success: boolean;
  /** Error message if failed */
  error?: string;
  /** List of exported filenames */
  filenames?: string[];
}

/**
 * Export validation result
 */
export interface ExportValidation {
  /** Whether export is allowed */
  canExport: boolean;
  /** Reason why export is not allowed */
  reason?: string;
  /** Whether this is a multi-section baseplate */
  isMultiSection: boolean;
  /** Number of sections (for multi-section) */
  sectionCount: number;
}

/**
 * Naming convention helper
 */
export interface NamingConfig {
  /** User-provided base filename */
  filename: string;
  /** Section number (1-based) for multi-section */
  sectionNumber?: number;
  /** Suffix to append */
  suffix?: string;
}

/**
 * Generate filename based on naming convention
 * 
 * Multi-section: Filename_Section1_RapidTool.stl
 * Single section: Filename_RapidTool.stl
 */
export function generateExportFilename(
  config: NamingConfig,
  format: ExportFormat = 'stl'
): string {
  const parts: string[] = [config.filename];
  
  if (config.sectionNumber !== undefined) {
    parts.push(`Section${config.sectionNumber}`);
  }
  
  parts.push(config.suffix ?? 'RapidTool');
  
  return `${parts.join('_')}.${format}`;
}
