/**
 * 共通型定義
 */

/**
 * 到達可能性解析の設定
 */
export interface ReachabilityConfig {
  /**
   * Interface の実装型（possibleTypes）も含めるか
   * @default true
   */
  includeInterfaceImplementations: boolean;

  /**
   * 参照型の含め方
   * - 'all': すべての参照型を含める（既定）
   * - 'args-only': 引数型のみ含め、戻り値はシードの直近のみ
   * - 'none': シードのフィールドのみ（参照を辿らない）
   */
  includeReferenced: "all" | "args-only" | "none";
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
   * 開始点の自動推論を有効にする
   * @default true
   */
  autoInferEntryPoints?: boolean;

  /**
   * 明示的な開始点（autoInferEntryPoints が false の場合に使用）
   */
  entryPoints?: {
    queries?: string[];
    mutations?: string[];
    types?: string[];
  };

  /**
   * 到達可能性解析の設定
   */
  reachabilityConfig?: Partial<ReachabilityConfig>;

  /**
   * フィールド保持方針の設定
   */
  filterConfig?: Partial<SchemaFilterConfig>;
}
