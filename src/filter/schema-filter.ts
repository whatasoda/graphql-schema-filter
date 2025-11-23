/**
 * スキーマフィルタリングエンジン
 *
 * 到達可能な型セットと @expose ルールに基づいてスキーマを再構築
 */

import {
  GraphQLSchema,
  GraphQLObjectType,
  GraphQLInterfaceType,
  GraphQLInputObjectType,
  GraphQLField,
  GraphQLFieldConfig,
  GraphQLFieldConfigMap,
  GraphQLInputFieldConfigMap,
  GraphQLNamedType,
  GraphQLFieldConfigArgumentMap,
  GraphQLType,
  GraphQLList,
  GraphQLNonNull,
  isNonNullType,
  isListType,
} from "graphql";
import type { ParsedExposeDirectives, SchemaFilterConfig } from "../types";
import { TypeKind } from "../utils/type-utils";
import { isFieldExposed } from "../parser/expose-parser";

const DEFAULT_CONFIG: SchemaFilterConfig = {
  fieldRetention: "exposed-only",
};

/**
 * 型参照をフィルタリングされた型に置き換える
 * List/NonNull ラッパーを保持しながら、名前付き型を置き換える
 */
export function replaceTypeReferences(
  type: GraphQLType,
  filteredTypeMap: Map<string, GraphQLNamedType>
): GraphQLType {
  if (isNonNullType(type)) {
    return new GraphQLNonNull(replaceTypeReferences(type.ofType, filteredTypeMap));
  }

  if (isListType(type)) {
    return new GraphQLList(replaceTypeReferences(type.ofType, filteredTypeMap));
  }

  // 名前付き型：フィルタリングされた型があればそれを使用
  const filteredType = filteredTypeMap.get(type.name);

  // DEBUG
  if (process.env.DEBUG_FIELD_FILTERING) {
    if (!filteredType && !TypeKind.isScalar(type)) {
      console.log(
        `[DEBUG] replaceTypeReferences(${type.name}): NOT in filteredTypeMap, using original`
      );
    }
  }

  return (filteredType ?? type) as GraphQLType;
}

/**
 * GraphQLField を GraphQLFieldConfig に変換
 * フィルタリングされた型への参照に置き換える
 */
export function convertFieldToConfig(
  field: GraphQLField<unknown, unknown>,
  filteredTypeMap: Map<string, GraphQLNamedType>
): GraphQLFieldConfig<unknown, unknown> {
  const args: GraphQLFieldConfigArgumentMap = {};

  for (const arg of field.args) {
    args[arg.name] = {
      type: replaceTypeReferences(arg.type, filteredTypeMap),
      description: arg.description,
      defaultValue: arg.defaultValue,
    };
  }

  return {
    type: replaceTypeReferences(field.type, filteredTypeMap),
    description: field.description,
    args,
    deprecationReason: field.deprecationReason,
    resolve: field.resolve,
    subscribe: field.subscribe,
    extensions: field.extensions,
    astNode: field.astNode,
  };
}

/**
 * InputObject 型のフィールドをフィルタリング
 */
export function filterInputObjectFields(
  type: GraphQLInputObjectType,
  role: string,
  parsedDirectives: ParsedExposeDirectives,
  filteredTypeMap: Map<string, GraphQLNamedType>
): GraphQLInputFieldConfigMap {
  const fields = type.getFields();
  const filteredFields: GraphQLInputFieldConfigMap = {};

  for (const [fieldName, field] of Object.entries(fields)) {
    // InputObject フィールドは寛容モード:
    // @expose がある場合のみチェックし、ない場合はデフォルトで含める
    const fieldTags = parsedDirectives.fieldExposeMap
      .get(type.name)
      ?.get(fieldName);

    if (fieldTags !== undefined) {
      // @expose がある場合、ロールが含まれているかチェック
      if (!fieldTags.includes(role)) {
        continue; // このロールには公開しない
      }
    }

    // フィールドを含める
    filteredFields[fieldName] = {
      type: replaceTypeReferences(field.type, filteredTypeMap),
      description: field.description,
      defaultValue: field.defaultValue,
      deprecationReason: field.deprecationReason,
      astNode: field.astNode,
      extensions: field.extensions,
    };
  }

  return filteredFields;
}

/**
 * Object 型のフィールドをフィルタリング
 */
export function filterObjectFields(
  type: GraphQLObjectType,
  schema: GraphQLSchema,
  role: string,
  parsedDirectives: ParsedExposeDirectives,
  finalConfig: SchemaFilterConfig,
  filteredTypeMap: Map<string, GraphQLNamedType>
): GraphQLFieldConfigMap<unknown, unknown> {
  const fields = type.getFields();
  const filteredFields: GraphQLFieldConfigMap<unknown, unknown> = {};

  for (const [fieldName, field] of Object.entries(fields)) {
    // フィールド保持方針に応じて判定
    const shouldInclude =
      finalConfig.fieldRetention === "all-for-included-type"
        ? true
        : isFieldExposed(schema, parsedDirectives, type.name, fieldName, role);

    // DEBUG
    if (
      process.env.DEBUG_FIELD_FILTERING &&
      (type.name === "BillingInfo" || type.name === "User")
    ) {
      console.log(
        `[DEBUG] ${type.name}.${fieldName}: shouldInclude=${shouldInclude}, role=${role}`
      );
    }

    if (shouldInclude) {
      filteredFields[fieldName] = convertFieldToConfig(field, filteredTypeMap);
    }
  }

  return filteredFields;
}

/**
 * Interface 型のフィールドをフィルタリング
 */
export function filterInterfaceFields(
  type: GraphQLInterfaceType,
  schema: GraphQLSchema,
  role: string,
  parsedDirectives: ParsedExposeDirectives,
  finalConfig: SchemaFilterConfig,
  filteredTypeMap: Map<string, GraphQLNamedType>
): GraphQLFieldConfigMap<unknown, unknown> {
  const fields = type.getFields();
  const filteredFields: GraphQLFieldConfigMap<unknown, unknown> = {};

  for (const [fieldName, field] of Object.entries(fields)) {
    // フィールド保持方針に応じて判定
    const shouldInclude =
      finalConfig.fieldRetention === "all-for-included-type"
        ? true
        : isFieldExposed(schema, parsedDirectives, type.name, fieldName, role);

    if (shouldInclude) {
      filteredFields[fieldName] = convertFieldToConfig(field, filteredTypeMap);
    }
  }

  return filteredFields;
}

/**
 * InputObject 型をフィルタリング
 */
export function filterInputObjectType(
  type: GraphQLInputObjectType,
  role: string,
  parsedDirectives: ParsedExposeDirectives,
  filteredTypeMap: Map<string, GraphQLNamedType>
): GraphQLInputObjectType | null {
  const filteredFields = filterInputObjectFields(
    type,
    role,
    parsedDirectives,
    filteredTypeMap
  );

  // フィールドが空の場合は型を削除
  if (Object.keys(filteredFields).length === 0) {
    return null;
  }

  return new GraphQLInputObjectType({
    name: type.name,
    description: type.description,
    fields: filteredFields,
    astNode: type.astNode,
    extensionASTNodes: type.extensionASTNodes,
    extensions: type.extensions,
  });
}

/**
 * Interface 型をフィルタリング
 */
export function filterInterfaceType(
  type: GraphQLInterfaceType,
  schema: GraphQLSchema,
  role: string,
  parsedDirectives: ParsedExposeDirectives,
  finalConfig: SchemaFilterConfig,
  filteredTypeMap: Map<string, GraphQLNamedType>
): GraphQLInterfaceType | null {
  const filteredFields = filterInterfaceFields(
    type,
    schema,
    role,
    parsedDirectives,
    finalConfig,
    filteredTypeMap
  );

  // フィールドが空の場合は型を削除
  if (Object.keys(filteredFields).length === 0) {
    return null;
  }

  // Interface 参照も filteredTypeMap の型に置き換える
  const filteredInterfaces = type.getInterfaces().map((iface) => {
    const filtered = filteredTypeMap.get(iface.name);
    return (filtered ?? iface) as GraphQLInterfaceType;
  });

  return new GraphQLInterfaceType({
    name: type.name,
    description: type.description,
    fields: filteredFields,
    interfaces: filteredInterfaces,
    astNode: type.astNode,
    extensionASTNodes: type.extensionASTNodes,
    extensions: type.extensions,
  });
}

/**
 * Object 型をフィルタリング
 */
export function filterObjectType(
  type: GraphQLObjectType,
  schema: GraphQLSchema,
  role: string,
  parsedDirectives: ParsedExposeDirectives,
  finalConfig: SchemaFilterConfig,
  filteredTypeMap: Map<string, GraphQLNamedType>
): GraphQLObjectType | null {
  const filteredFields = filterObjectFields(
    type,
    schema,
    role,
    parsedDirectives,
    finalConfig,
    filteredTypeMap
  );

  // フィールドが空の場合は型を削除
  if (Object.keys(filteredFields).length === 0) {
    return null;
  }

  // Interface 参照も filteredTypeMap の型に置き換える
  const filteredInterfaces = type.getInterfaces().map((iface) => {
    const filtered = filteredTypeMap.get(iface.name);
    return (filtered ?? iface) as GraphQLInterfaceType;
  });

  return new GraphQLObjectType({
    name: type.name,
    description: type.description,
    fields: filteredFields,
    interfaces: filteredInterfaces,
    astNode: type.astNode,
    extensionASTNodes: type.extensionASTNodes,
    extensions: type.extensions,
  });
}

/**
 * 型をフィルタリング
 */
export function filterType(
  type: GraphQLNamedType,
  schema: GraphQLSchema,
  role: string,
  parsedDirectives: ParsedExposeDirectives,
  finalConfig: SchemaFilterConfig,
  filteredTypeMap: Map<string, GraphQLNamedType>
): GraphQLNamedType | null {
  if (TypeKind.isObject(type)) {
    return filterObjectType(type, schema, role, parsedDirectives, finalConfig, filteredTypeMap);
  } else if (TypeKind.isInterface(type)) {
    return filterInterfaceType(type, schema, role, parsedDirectives, finalConfig, filteredTypeMap);
  } else if (TypeKind.isUnion(type)) {
    return type; // Union はそのまま
  } else if (TypeKind.isInputObject(type)) {
    return filterInputObjectType(type, role, parsedDirectives, filteredTypeMap);
  } else if (TypeKind.isEnum(type)) {
    return type; // Enum はそのまま
  } else if (TypeKind.isScalar(type)) {
    return type; // Scalar はそのまま
  }

  return null;
}

/**
 * フィルタリングされた型のマップを構築
 */
export function buildFilteredTypeMap(
  schema: GraphQLSchema,
  role: string,
  reachableTypes: Set<string>,
  parsedDirectives: ParsedExposeDirectives,
  finalConfig: SchemaFilterConfig
): Map<string, GraphQLNamedType> {
  const filteredTypeMap = new Map<string, GraphQLNamedType>();
  const typeMap = schema.getTypeMap();

  for (const [typeName, type] of Object.entries(typeMap)) {
    // 到達可能でない型はスキップ
    if (!reachableTypes.has(typeName)) {
      continue;
    }

    // Introspection 型はスキップ
    if (typeName.startsWith("__")) {
      continue;
    }

    // ルート型はスキップ（個別に処理）
    if (
      type === schema.getQueryType() ||
      type === schema.getMutationType() ||
      type === schema.getSubscriptionType()
    ) {
      continue;
    }

    // Scalar/Enum はそのまま使用
    if (TypeKind.isScalar(type) || TypeKind.isEnum(type)) {
      filteredTypeMap.set(typeName, type);
      continue;
    }

    // InputObject はフィールドフィルタリングを適用
    if (TypeKind.isInputObject(type)) {
      const filteredInputType = filterInputObjectType(
        type,
        role,
        parsedDirectives,
        filteredTypeMap
      );
      if (filteredInputType) {
        filteredTypeMap.set(typeName, filteredInputType);
      }
      continue;
    }

    // Object/Interface/Union 型をフィルタリング
    const filteredType = filterType(
      type,
      schema,
      role,
      parsedDirectives,
      finalConfig,
      filteredTypeMap
    );
    if (filteredType) {
      filteredTypeMap.set(typeName, filteredType);

      // DEBUG
      if (process.env.DEBUG_FIELD_FILTERING && typeName === "BillingInfo") {
        const billingFields = (filteredType as GraphQLObjectType).getFields();
        console.log(
          `[DEBUG] Filtered BillingInfo fields:`,
          Object.keys(billingFields)
        );
      }
    }
  }

  return filteredTypeMap;
}

/**
 * ルート型（Query/Mutation/Subscription）を構築
 */
export function buildRootType(
  rootTypeName: "Query" | "Mutation" | "Subscription",
  schema: GraphQLSchema,
  role: string,
  parsedDirectives: ParsedExposeDirectives,
  finalConfig: SchemaFilterConfig,
  filteredTypeMap: Map<string, GraphQLNamedType>
): GraphQLObjectType | undefined {
  let rootType: GraphQLObjectType | undefined;

  if (rootTypeName === "Query") {
    rootType = schema.getQueryType() ?? undefined;
  } else if (rootTypeName === "Mutation") {
    rootType = schema.getMutationType() ?? undefined;
  } else if (rootTypeName === "Subscription") {
    rootType = schema.getSubscriptionType() ?? undefined;
  }

  if (!rootType) {
    return undefined;
  }

  // フィールドをフィルタリング
  const filteredFields = filterObjectFields(
    rootType,
    schema,
    role,
    parsedDirectives,
    finalConfig,
    filteredTypeMap
  );

  // フィールドが空の場合は undefined を返す
  if (Object.keys(filteredFields).length === 0) {
    return undefined;
  }

  const result = new GraphQLObjectType({
    name: rootType.name,
    description: rootType.description,
    fields: filteredFields,
  });

  // DEBUG
  if (process.env.DEBUG_FIELD_FILTERING) {
    console.log(
      `[DEBUG] Built ${rootType.name} with ${Object.keys(filteredFields).length} fields`
    );
    for (const [fieldName, config] of Object.entries(filteredFields)) {
      const typeName = config.type.toString();
      console.log(`[DEBUG]   ${fieldName}: ${typeName}`);
    }
  }

  return result;
}

/**
 * フィルタリング済みスキーマを構築
 *
 * @param schema - 元のGraphQLスキーマ
 * @param role - 対象ロール
 * @param reachableTypes - 到達可能な型名の集合
 * @param parsedDirectives - パース済みの @expose ディレクティブ情報
 * @param config - スキーマフィルタリングの設定
 * @returns フィルタリング済みのGraphQLスキーマ
 *
 * @remarks
 * 2パスアプローチを使用:
 * - Pass 1: 全ての非ルート型をフィルタリングしてマップに格納
 * - Pass 2: ルート型を構築（フィルタリングされた型への参照を使用）
 */
export function buildFilteredSchema(
  schema: GraphQLSchema,
  role: string,
  reachableTypes: Set<string>,
  parsedDirectives: ParsedExposeDirectives,
  config?: Partial<SchemaFilterConfig>
): GraphQLSchema {
  const finalConfig: SchemaFilterConfig = { ...DEFAULT_CONFIG, ...config };

  // Pass 1: 全ての非ルート型をフィルタリングしてマップに格納
  const filteredTypeMap = buildFilteredTypeMap(
    schema,
    role,
    reachableTypes,
    parsedDirectives,
    finalConfig
  );

  // Pass 2: ルート型を構築（フィルタリングされた型への参照を使用）
  const queryType = buildRootType(
    "Query",
    schema,
    role,
    parsedDirectives,
    finalConfig,
    filteredTypeMap
  );
  const mutationType = buildRootType(
    "Mutation",
    schema,
    role,
    parsedDirectives,
    finalConfig,
    filteredTypeMap
  );
  const subscriptionType = buildRootType(
    "Subscription",
    schema,
    role,
    parsedDirectives,
    finalConfig,
    filteredTypeMap
  );

  // NOTE: GraphQLSchema は Query/Mutation から参照される型を自動的に含めるため、
  // types 配列は空で問題ない。明示的に types を渡すと重複エラーが発生する。
  // 参照されない孤立した型のみを明示的に含める必要があるが、
  // フィルタリング後のスキーマでは孤立した型は存在しない想定。

  // DEBUG
  if (process.env.DEBUG_FIELD_FILTERING) {
    const typeNames = Array.from(filteredTypeMap.keys());
    console.log(
      `[DEBUG] filteredTypeMap contains ${typeNames.length} types:`,
      typeNames.join(", ")
    );

    // 重複チェック
    const duplicates = typeNames.filter(
      (name, index) => typeNames.indexOf(name) !== index
    );
    if (duplicates.length > 0) {
      console.log(
        `[DEBUG] WARNING: Duplicate types in filteredTypeMap:`,
        duplicates
      );
    }
  }

  // 新しいスキーマを構築
  return new GraphQLSchema({
    query: queryType,
    mutation: mutationType,
    subscription: subscriptionType,
  });
}
