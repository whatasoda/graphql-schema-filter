/**
 * @expose ディレクティブのパースと適用ルールの解決
 */

import {
  GraphQLSchema,
  GraphQLObjectType,
  GraphQLInterfaceType,
  GraphQLInputObjectType,
} from "graphql";
import type { ParsedExposeDirectives } from "../types";
import { TypeKind } from "../utils/type-utils";

/**
 * @expose ディレクティブの情報
 */
export interface ExposeDirective {
  tags: string[];
}

/**
 * パース結果のメモ化用キャッシュ
 */
const parseCache = new WeakMap<GraphQLSchema, ParsedExposeDirectives>();

/**
 * スキーマから @expose ディレクティブを抽出
 *
 * @param schema - GraphQLスキーマ
 * @returns パース済みの @expose ディレクティブ情報
 *
 * @remarks
 * 同一スキーマに対する呼び出しはキャッシュされ、再計算されません。
 */
export function parseExposeDirectives(
  schema: GraphQLSchema
): ParsedExposeDirectives {
  // キャッシュチェック
  const cached = parseCache.get(schema);
  if (cached) {
    return cached;
  }

  // パース実行
  const fieldExposeMap = new Map<string, Map<string, string[]>>();
  const typeDisableAutoExposeSet = new Set<string>();
  const typeMap = schema.getTypeMap();

  for (const [typeName, type] of Object.entries(typeMap)) {
    // Introspection 型や組み込み型はスキップ
    if (typeName.startsWith("__")) continue;

    // Object/Interface 型の処理
    if (TypeKind.isObject(type) || TypeKind.isInterface(type)) {
      parseObjectOrInterface(type, fieldExposeMap, typeDisableAutoExposeSet);
    }
    // InputObject 型の処理
    else if (TypeKind.isInputObject(type)) {
      parseInputObject(type, fieldExposeMap);
    }
  }

  // 結果を構築してキャッシュ
  const result: ParsedExposeDirectives = {
    fieldExposeMap,
    typeDisableAutoExposeSet,
  };

  parseCache.set(schema, result);
  return result;
}

/**
 * Object/Interface 型の @expose を解析
 */
function parseObjectOrInterface(
  type: GraphQLObjectType | GraphQLInterfaceType,
  fieldExposeMap: Map<string, Map<string, string[]>>,
  typeDisableAutoExposeSet: Set<string>
): void {
  // 型レベルの @disableAutoExpose をチェック
  const hasDisableAutoExpose = type.astNode?.directives?.some(
    (d) => d.name.value === "disableAutoExpose"
  );
  if (hasDisableAutoExpose) {
    typeDisableAutoExposeSet.add(type.name);
  }

  // フィールドレベルの @expose を取得
  const fields = type.getFields();
  for (const [fieldName, field] of Object.entries(fields)) {
    const fieldTags = extractTagsFromDirectives(
      field.astNode?.directives ?? []
    );
    if (fieldTags !== undefined) {
      setFieldExpose(fieldExposeMap, type.name, fieldName, fieldTags);
    }
  }
}

/**
 * InputObject 型の @expose を解析
 */
function parseInputObject(
  type: GraphQLInputObjectType,
  fieldExposeMap: Map<string, Map<string, string[]>>
): void {
  // InputObject のフィールドレベルの @expose を取得
  const fields = type.getFields();
  for (const [fieldName, field] of Object.entries(fields)) {
    const fieldTags = extractTagsFromDirectives(
      field.astNode?.directives ?? []
    );
    if (fieldTags !== undefined) {
      setFieldExpose(fieldExposeMap, type.name, fieldName, fieldTags);
    }
  }
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
 * フィールドレベルの @expose を設定
 */
function setFieldExpose(
  fieldExposeMap: Map<string, Map<string, string[]>>,
  typeName: string,
  fieldName: string,
  tags: string[]
): void {
  if (!fieldExposeMap.has(typeName)) {
    fieldExposeMap.set(typeName, new Map());
  }
  fieldExposeMap.get(typeName)!.set(fieldName, tags);
}

/**
 * 指定された型が Root 型（Query/Mutation/Subscription）かを判定
 */
function isRootType(schema: GraphQLSchema, typeName: string): boolean {
  return (
    typeName === schema.getQueryType()?.name ||
    typeName === schema.getMutationType()?.name ||
    typeName === schema.getSubscriptionType()?.name
  );
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
  parsed: ParsedExposeDirectives,
  typeName: string,
  fieldName: string,
  role: string
): boolean {
  // フィールドレベルの @expose をチェック
  const fieldTags = parsed.fieldExposeMap.get(typeName)?.get(fieldName);
  if (fieldTags !== undefined) {
    return fieldTags.includes(role);
  }

  // @expose がない場合の判定
  // Root 型または @disableAutoExpose が付いている型は除外
  if (
    isRootType(schema, typeName) ||
    parsed.typeDisableAutoExposeSet.has(typeName)
  ) {
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
  parsed: ParsedExposeDirectives,
  typeName: string,
  role: string
): string[] {
  const type = schema.getType(typeName);
  if (!type || !(TypeKind.isObject(type) || TypeKind.isInterface(type))) {
    return [];
  }

  const fields = type.getFields();
  const exposedFields: string[] = [];

  for (const [fieldName] of Object.entries(fields)) {
    if (isFieldExposed(schema, parsed, typeName, fieldName, role)) {
      exposedFields.push(fieldName);
    }
  }

  return exposedFields;
}

/**
 * デバッグ用：すべての @expose 情報を出力
 *
 * @param parsed - パース済みの @expose ディレクティブ情報
 */
export function debugExposeDirectives(parsed: ParsedExposeDirectives): void {
  console.log("=== Types with @disableAutoExpose ===");
  if (parsed.typeDisableAutoExposeSet.size === 0) {
    console.log("  (none)");
  } else {
    for (const typeName of parsed.typeDisableAutoExposeSet) {
      console.log(`  ${typeName}`);
    }
  }

  console.log("\n=== Field-level @expose ===");
  if (parsed.fieldExposeMap.size === 0) {
    console.log("  (none)");
  } else {
    for (const [typeName, fieldMap] of parsed.fieldExposeMap.entries()) {
      for (const [fieldName, tags] of fieldMap.entries()) {
        console.log(`${typeName}.${fieldName}: [${tags.join(", ")}]`);
      }
    }
  }
}
