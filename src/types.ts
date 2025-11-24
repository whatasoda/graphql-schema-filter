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
 * スキーマフィルタの設定
 */
export interface SchemaFilterConfig {
  /**
   * フィールド保持方針
   * - 'exposed-only': @expose で公開されたフィールドのみ保持（既定）
   * - 'all-for-included-type': 型を含めると決めたら全フィールドも含める
   */
  fieldRetention: "exposed-only" | "all-for-included-type";
}

/**
 * スキーマフィルタリングのオプション
 */
export interface FilterSchemaOptions {
  /**
   * 対象ロール
   */
  role: string;

  /**
   * フィールド保持方針の設定
   */
  filterConfig?: Partial<SchemaFilterConfig>;
}
