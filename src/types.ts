/**
 * 共通型定義
 */

/**
 * 型レベルの exposure 情報
 */
export interface TypeLevelExposureInfo {
  readonly typeName: string;
  readonly isRootType: boolean;
  readonly isAutoExposeDisabled: boolean;
  readonly fields: ReadonlyMap<string, FieldLevelExposureInfo>;
}

/**
 * フィールドレベルの exposure 情報
 */
export interface FieldLevelExposureInfo {
  readonly fieldName: string;
  readonly tags: readonly string[];
}

/**
 * スキーマ解析結果
 * @expose ディレクティブのパース結果と型情報を含む
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
 * スキーマフィルタリングのオプション
 */
export interface FilterSchemaOptions {
  /**
   * 対象ロール
   */
  role: string;
}
