/**
 * Common type definitions
 */

/**
 * Type-level exposure information
 */
export interface TypeLevelExposureInfo {
  readonly typeName: string;
  readonly isRootType: boolean;
  readonly isAutoExposeDisabled: boolean;
  readonly fields: ReadonlyMap<string, FieldLevelExposureInfo>;
}

/**
 * Field-level exposure information
 */
export interface FieldLevelExposureInfo {
  readonly fieldName: string;
  readonly tags: readonly string[];
}

/**
 * Schema analysis result
 * Contains parsed @expose directive results and type information
 */
export interface SchemaAnalysis {
  readonly rootTypeNames: {
    readonly query: string | null;
    readonly mutation: string | null;
    readonly subscription: string | null;
  };

  readonly exposureInfoMap: ReadonlyMap<string, TypeLevelExposureInfo>;
}

/**
 * Schema filtering options
 */
export interface FilterSchemaOptions {
  /**
   * Target identifier
   */
  target: string;
}
