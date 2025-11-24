/**
 * 共通型定義
 */

/**
 * @expose ディレクティブのパース結果
 */
export interface ParsedExposeDirectives {
  /**
   * フィールドレベルの公開設定
   * Map<型名, Map<フィールド名, タグ配列>>
   */
  readonly fieldExposeMap: ReadonlyMap<
    string,
    ReadonlyMap<string, readonly string[]>
  >;

  /**
   * @disableAutoExpose が指定された型の集合
   */
  readonly typeDisableAutoExposeSet: ReadonlySet<string>;
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
