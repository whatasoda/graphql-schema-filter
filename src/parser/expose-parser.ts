/**
 * @expose ディレクティブのパースと適用ルールの解決
 */

import {
  GraphQLSchema,
  GraphQLObjectType,
  GraphQLInterfaceType,
  GraphQLInputObjectType,
  isObjectType,
  isInterfaceType,
  isInputObjectType,
  isIntrospectionType,
} from "graphql";
import type {
  SchemaAnalysis,
  TypeLevelExposureInfo,
  FieldLevelExposureInfo,
} from "../types";

/**
 * @expose ディレクティブの情報
 */
export interface ExposeDirective {
  tags: string[];
}

/**
 * パース結果のメモ化用キャッシュ
 */
const analysisCache = new WeakMap<GraphQLSchema, SchemaAnalysis>();

/**
 * スキーマから @expose ディレクティブを抽出
 *
 * @param schema - GraphQLスキーマ
 * @returns パース済みの @expose ディレクティブ情報
 *
 * @remarks
 * 同一スキーマに対する呼び出しはキャッシュされ、再計算されません。
 */
export function parseExposeDirectives(schema: GraphQLSchema): SchemaAnalysis {
  // キャッシュチェック
  const cached = analysisCache.get(schema);
  if (cached) {
    return cached;
  }

  // Root 型の名前を取得
  const rootTypeNames = {
    query: schema.getQueryType()?.name ?? null,
    mutation: schema.getMutationType()?.name ?? null,
    subscription: schema.getSubscriptionType()?.name ?? null,
  };

  // Root 型名のセット（高速検索用）
  const rootTypeNameSet = new Set<string>(
    [
      rootTypeNames.query,
      rootTypeNames.mutation,
      rootTypeNames.subscription,
    ].filter((name): name is string => name !== null)
  );

  // exposureInfoMap を構築
  const exposureInfoMap = new Map<string, TypeLevelExposureInfo>();

  for (const [typeName, type] of Object.entries(schema.getTypeMap())) {
    // Introspection 型や組み込み型はスキップ
    if (isIntrospectionType(type)) continue;

    // 型レベルの情報を初期化
    const isRoot = rootTypeNameSet.has(typeName);
    let isAutoExposeDisabled = false;
    const fieldsMap = new Map<string, FieldLevelExposureInfo>();

    // Object/Interface 型の処理
    if (isObjectType(type) || isInterfaceType(type)) {
      // 型レベルの @disableAutoExpose をチェック
      isAutoExposeDisabled =
        type.astNode?.directives?.some(
          (d) => d.name.value === "disableAutoExpose"
        ) ?? false;

      // フィールドレベルの @expose を取得
      const fields = type.getFields();
      for (const [fieldName, field] of Object.entries(fields)) {
        const fieldTags = extractTagsFromDirectives(
          field.astNode?.directives ?? []
        );
        if (fieldTags !== undefined) {
          fieldsMap.set(fieldName, {
            fieldName,
            tags: fieldTags,
          });
        }
      }
    }
    // InputObject 型の処理
    else if (isInputObjectType(type)) {
      // InputObject のフィールドレベルの @expose を取得
      const fields = type.getFields();
      for (const [fieldName, field] of Object.entries(fields)) {
        const fieldTags = extractTagsFromDirectives(
          field.astNode?.directives ?? []
        );
        if (fieldTags !== undefined) {
          fieldsMap.set(fieldName, {
            fieldName,
            tags: fieldTags,
          });
        }
      }
    }

    // TypeLevelExposureInfo を作成
    exposureInfoMap.set(typeName, {
      typeName,
      isRootType: isRoot,
      isAutoExposeDisabled,
      fields: fieldsMap,
    });
  }

  // SchemaAnalysis を構築してキャッシュ
  const result: SchemaAnalysis = {
    rootTypeNames,
    exposureInfoMap,
  };

  analysisCache.set(schema, result);
  return result;
}

/**
 * AST ノードから @expose ディレクティブのロールを抽出
 * @returns ディレクティブが存在する場合は tags 配列、存在しない場合は undefined
 */
function extractTagsFromDirectives(
  directives: readonly any[]
): string[] | undefined {
  let hasExposeDirective = false;
  const allTags: string[] = [];

  for (const directive of directives) {
    if (directive.name.value === "expose") {
      hasExposeDirective = true;
      const tagsArg = directive.arguments?.find(
        (arg: any) => arg.name.value === "tags"
      );
      if (tagsArg && tagsArg.value.kind === "ListValue") {
        const tags = tagsArg.value.values.map((v: any) => v.value) as string[];
        allTags.push(...tags);
      }
    }
  }

  // ディレクティブが存在しない場合は undefined を返す
  if (!hasExposeDirective) {
    return undefined;
  }

  return Array.from(new Set(allTags)); // 重複を除去
}

/**
 * 指定されたロールがフィールドにアクセス可能かを判定
 *
 * ルール:
 * - フィールドに @expose がある場合、そのロールリストで判定
 * - フィールドに @expose がない場合:
 *   - Query/Mutation/Subscription 型: 非公開（除外）
 *   - @disableAutoExpose が付いた型: 非公開（除外）
 *   - その他の output type: 公開（デフォルト公開）
 *
 * @param schema - GraphQLスキーマ
 * @param parsed - パース済みの @expose ディレクティブ情報
 * @param typeName - 型名
 * @param fieldName - フィールド名
 * @param role - ロール名
 * @returns フィールドが公開されている場合は true
 */
export function isFieldExposed(
  schema: GraphQLSchema,
  analysis: SchemaAnalysis,
  typeName: string,
  fieldName: string,
  role: string
): boolean {
  const exposureInfo = analysis.exposureInfoMap.get(typeName);
  if (!exposureInfo) {
    return false;
  }

  // フィールドレベルの @expose をチェック
  const field = exposureInfo.fields.get(fieldName);
  if (field !== undefined) {
    return field.tags.includes(role);
  }

  // @expose がない場合の判定
  // Root 型または @disableAutoExpose が付いている型は除外
  if (exposureInfo.isRootType || exposureInfo.isAutoExposeDisabled) {
    return false;
  }

  // その他の output type はデフォルト公開
  return true;
}

/**
 * 指定されたロールで公開されるフィールド名のリストを取得
 *
 * @param schema - GraphQLスキーマ
 * @param parsed - パース済みの @expose ディレクティブ情報
 * @param typeName - 型名
 * @param role - ロール名
 * @returns 公開されているフィールド名の配列
 */
export function getExposedFields(
  schema: GraphQLSchema,
  analysis: SchemaAnalysis,
  typeName: string,
  role: string
): string[] {
  const type = schema.getType(typeName);
  if (!type || !(isObjectType(type) || isInterfaceType(type))) {
    return [];
  }

  const fields = type.getFields();
  const exposedFields: string[] = [];

  for (const [fieldName] of Object.entries(fields)) {
    if (isFieldExposed(schema, analysis, typeName, fieldName, role)) {
      exposedFields.push(fieldName);
    }
  }

  return exposedFields;
}

/**
 * デバッグ用：すべての @expose 情報を出力
 *
 * @param analysis - SchemaAnalysis 情報
 */
export function debugExposeDirectives(analysis: SchemaAnalysis): void {
  console.log("=== Root Types ===");
  console.log(`  Query: ${analysis.rootTypeNames.query ?? "(none)"}`);
  console.log(`  Mutation: ${analysis.rootTypeNames.mutation ?? "(none)"}`);
  console.log(
    `  Subscription: ${analysis.rootTypeNames.subscription ?? "(none)"}`
  );

  console.log("\n=== Types with @disableAutoExpose ===");
  const disabledTypes = Array.from(analysis.exposureInfoMap.values()).filter(
    (info) => info.isAutoExposeDisabled
  );
  if (disabledTypes.length === 0) {
    console.log("  (none)");
  } else {
    for (const info of disabledTypes) {
      console.log(`  ${info.typeName}`);
    }
  }

  console.log("\n=== Field-level @expose ===");
  let hasExposedFields = false;
  for (const [typeName, typeInfo] of analysis.exposureInfoMap.entries()) {
    for (const [fieldName, fieldInfo] of typeInfo.fields.entries()) {
      hasExposedFields = true;
      console.log(`${typeName}.${fieldName}: [${fieldInfo.tags.join(", ")}]`);
    }
  }
  if (!hasExposedFields) {
    console.log("  (none)");
  }
}
