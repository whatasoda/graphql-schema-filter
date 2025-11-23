/**
 * スキーマフィルタリングエンジン
 *
 * 到達可能な型セットと @expose ルールに基づいてスキーマを再構築
 */

import {
  GraphQLSchema,
  GraphQLObjectType,
  GraphQLInterfaceType,
  GraphQLUnionType,
  GraphQLInputObjectType,
  GraphQLEnumType,
  GraphQLScalarType,
  GraphQLField,
  GraphQLFieldConfig,
  GraphQLFieldConfigMap,
  GraphQLInputFieldConfig,
  GraphQLInputFieldConfigMap,
  GraphQLNamedType,
  GraphQLFieldConfigArgumentMap,
  GraphQLType,
  GraphQLList,
  GraphQLNonNull,
  isNonNullType,
  isListType,
} from "graphql";
import { TypeKind } from "../utils/type-utils";
import { ExposeParser } from "../parser/expose-parser";

export interface SchemaFilterConfig {
  /**
   * フィールド保持方針
   * - 'exposed-only': @expose で公開されたフィールドのみ保持（既定）
   * - 'all-for-included-type': 型を含めると決めたら全フィールドも含める
   */
  fieldRetention: "exposed-only" | "all-for-included-type";
}

const DEFAULT_CONFIG: SchemaFilterConfig = {
  fieldRetention: "exposed-only",
};

/**
 * スキーマフィルタリングエンジン
 */
export class SchemaFilter {
  private schema: GraphQLSchema;
  private exposeParser: ExposeParser;
  private role: string;
  private reachableTypes: Set<string>;
  private config: SchemaFilterConfig;
  private filteredTypeMap: Map<string, GraphQLNamedType> = new Map();

  constructor(
    schema: GraphQLSchema,
    role: string,
    reachableTypes: Set<string>,
    config?: Partial<SchemaFilterConfig>
  ) {
    this.schema = schema;
    this.role = role;
    this.reachableTypes = reachableTypes;
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.exposeParser = new ExposeParser(schema);
  }

  /**
   * フィルタ済みスキーマを構築（2パスアプローチ）
   */
  buildFilteredSchema(): GraphQLSchema {
    // Pass 1: 全ての非ルート型をフィルタリングしてマップに格納
    this.buildFilteredTypeMap();

    // Pass 2: ルート型を構築（フィルタリングされた型への参照を使用）
    const queryType = this.buildRootType("Query");
    const mutationType = this.buildRootType("Mutation");
    const subscriptionType = this.buildRootType("Subscription");

    // NOTE: GraphQLSchema は Query/Mutation から参照される型を自動的に含めるため、
    // types 配列は空で問題ない。明示的に types を渡すと重複エラーが発生する。
    // 参照されない孤立した型のみを明示的に含める必要があるが、
    // フィルタリング後のスキーマでは孤立した型は存在しない想定。

    // DEBUG
    if (process.env.DEBUG_FIELD_FILTERING) {
      const typeNames = Array.from(this.filteredTypeMap.keys());
      console.log(`[DEBUG] filteredTypeMap contains ${typeNames.length} types:`, typeNames.join(", "));

      // 重複チェック
      const duplicates = typeNames.filter((name, index) => typeNames.indexOf(name) !== index);
      if (duplicates.length > 0) {
        console.log(`[DEBUG] WARNING: Duplicate types in filteredTypeMap:`, duplicates);
      }
    }

    // 新しいスキーマを構築
    return new GraphQLSchema({
      query: queryType,
      mutation: mutationType,
      subscription: subscriptionType,
    });
  }

  /**
   * フィルタリングされた型のマップを構築
   */
  private buildFilteredTypeMap(): void {
    const typeMap = this.schema.getTypeMap();

    for (const [typeName, type] of Object.entries(typeMap)) {
      // 到達可能でない型はスキップ
      if (!this.reachableTypes.has(typeName)) {
        continue;
      }

      // Introspection 型はスキップ
      if (typeName.startsWith("__")) {
        continue;
      }

      // ルート型はスキップ（個別に処理）
      if (
        type === this.schema.getQueryType() ||
        type === this.schema.getMutationType() ||
        type === this.schema.getSubscriptionType()
      ) {
        continue;
      }

      // Scalar/Enum はそのまま使用
      if (TypeKind.isScalar(type) || TypeKind.isEnum(type)) {
        this.filteredTypeMap.set(typeName, type);
        continue;
      }

      // InputObject はフィールドフィルタリングを適用
      if (TypeKind.isInputObject(type)) {
        const filteredInputType = this.filterInputObjectType(type);
        if (filteredInputType) {
          this.filteredTypeMap.set(typeName, filteredInputType);
        }
        continue;
      }

      // Object/Interface/Union 型をフィルタリング
      const filteredType = this.filterType(type);
      if (filteredType) {
        this.filteredTypeMap.set(typeName, filteredType);

        // DEBUG
        if (process.env.DEBUG_FIELD_FILTERING && typeName === "BillingInfo") {
          const billingFields = (filteredType as GraphQLObjectType).getFields();
          console.log(`[DEBUG] Filtered BillingInfo fields:`, Object.keys(billingFields));
        }
      }
    }
  }

  /**
   * ルート型（Query/Mutation/Subscription）を構築
   */
  private buildRootType(
    rootTypeName: "Query" | "Mutation" | "Subscription"
  ): GraphQLObjectType | undefined {
    let rootType: GraphQLObjectType | undefined;

    if (rootTypeName === "Query") {
      rootType = this.schema.getQueryType() ?? undefined;
    } else if (rootTypeName === "Mutation") {
      rootType = this.schema.getMutationType() ?? undefined;
    } else if (rootTypeName === "Subscription") {
      rootType = this.schema.getSubscriptionType() ?? undefined;
    }

    if (!rootType) {
      return undefined;
    }

    // フィールドをフィルタリング
    const filteredFields = this.filterObjectFields(rootType);

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
      console.log(`[DEBUG] Built ${rootType.name} with ${Object.keys(filteredFields).length} fields`);
      for (const [fieldName, config] of Object.entries(filteredFields)) {
        const typeName = config.type.toString();
        console.log(`[DEBUG]   ${fieldName}: ${typeName}`);
      }
    }

    return result;
  }

  /**
   * 型をフィルタリング
   */
  private filterType(type: GraphQLNamedType): GraphQLNamedType | null {
    if (TypeKind.isObject(type)) {
      return this.filterObjectType(type);
    } else if (TypeKind.isInterface(type)) {
      return this.filterInterfaceType(type);
    } else if (TypeKind.isUnion(type)) {
      return type; // Union はそのまま
    } else if (TypeKind.isInputObject(type)) {
      return this.filterInputObjectType(type);
    } else if (TypeKind.isEnum(type)) {
      return type; // Enum はそのまま
    } else if (TypeKind.isScalar(type)) {
      return type; // Scalar はそのまま
    }

    return null;
  }

  /**
   * Object 型をフィルタリング
   */
  private filterObjectType(
    type: GraphQLObjectType
  ): GraphQLObjectType | null {
    const filteredFields = this.filterObjectFields(type);

    // フィールドが空の場合は型を削除
    if (Object.keys(filteredFields).length === 0) {
      return null;
    }

    // Interface 参照も filteredTypeMap の型に置き換える
    const filteredInterfaces = type.getInterfaces().map((iface) => {
      const filtered = this.filteredTypeMap.get(iface.name);
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
   * Interface 型をフィルタリング
   */
  private filterInterfaceType(
    type: GraphQLInterfaceType
  ): GraphQLInterfaceType | null {
    const filteredFields = this.filterInterfaceFields(type);

    // フィールドが空の場合は型を削除
    if (Object.keys(filteredFields).length === 0) {
      return null;
    }

    // Interface 参照も filteredTypeMap の型に置き換える
    const filteredInterfaces = type.getInterfaces().map((iface) => {
      const filtered = this.filteredTypeMap.get(iface.name);
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
   * InputObject 型をフィルタリング
   */
  private filterInputObjectType(
    type: GraphQLInputObjectType
  ): GraphQLInputObjectType | null {
    const filteredFields = this.filterInputObjectFields(type);

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
   * Object 型のフィールドをフィルタリング
   */
  private filterObjectFields(
    type: GraphQLObjectType
  ): GraphQLFieldConfigMap<unknown, unknown> {
    const fields = type.getFields();
    const filteredFields: GraphQLFieldConfigMap<unknown, unknown> = {};

    for (const [fieldName, field] of Object.entries(fields)) {
      // フィールド保持方針に応じて判定
      const shouldInclude =
        this.config.fieldRetention === "all-for-included-type"
          ? true
          : this.exposeParser.isFieldExposed(type.name, fieldName, this.role);

      // DEBUG
      if (process.env.DEBUG_FIELD_FILTERING && (type.name === "BillingInfo" || type.name === "User")) {
        console.log(`[DEBUG] ${type.name}.${fieldName}: shouldInclude=${shouldInclude}, role=${this.role}`);
      }

      if (shouldInclude) {
        filteredFields[fieldName] = this.convertFieldToConfig(field);
      }
    }

    return filteredFields;
  }

  /**
   * Interface 型のフィールドをフィルタリング
   */
  private filterInterfaceFields(
    type: GraphQLInterfaceType
  ): GraphQLFieldConfigMap<unknown, unknown> {
    const fields = type.getFields();
    const filteredFields: GraphQLFieldConfigMap<unknown, unknown> = {};

    for (const [fieldName, field] of Object.entries(fields)) {
      // フィールド保持方針に応じて判定
      const shouldInclude =
        this.config.fieldRetention === "all-for-included-type"
          ? true
          : this.exposeParser.isFieldExposed(type.name, fieldName, this.role);

      if (shouldInclude) {
        filteredFields[fieldName] = this.convertFieldToConfig(field);
      }
    }

    return filteredFields;
  }

  /**
   * InputObject 型のフィールドをフィルタリング
   */
  private filterInputObjectFields(
    type: GraphQLInputObjectType
  ): GraphQLInputFieldConfigMap {
    const fields = type.getFields();
    const filteredFields: GraphQLInputFieldConfigMap = {};

    for (const [fieldName, field] of Object.entries(fields)) {
      // InputObject フィールドは寛容モード:
      // @expose がある場合のみチェックし、ない場合はデフォルトで含める
      const fieldTags = this.exposeParser.fieldExposeMap
        .get(type.name)
        ?.get(fieldName);

      if (fieldTags !== undefined) {
        // @expose がある場合、ロールが含まれているかチェック
        if (!fieldTags.includes(this.role)) {
          continue; // このロールには公開しない
        }
      }

      // フィールドを含める
      filteredFields[fieldName] = {
        type: this.replaceTypeReferences(field.type),
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
   * GraphQLField を GraphQLFieldConfig に変換
   * フィルタリングされた型への参照に置き換える
   */
  private convertFieldToConfig(
    field: GraphQLField<unknown, unknown>
  ): GraphQLFieldConfig<unknown, unknown> {
    const args: GraphQLFieldConfigArgumentMap = {};

    for (const arg of field.args) {
      args[arg.name] = {
        type: this.replaceTypeReferences(arg.type),
        description: arg.description,
        defaultValue: arg.defaultValue,
      };
    }

    return {
      type: this.replaceTypeReferences(field.type),
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
   * 型参照をフィルタリングされた型に置き換える
   * List/NonNull ラッパーを保持しながら、名前付き型を置き換える
   */
  private replaceTypeReferences(type: GraphQLType): GraphQLType {
    if (isNonNullType(type)) {
      return new GraphQLNonNull(this.replaceTypeReferences(type.ofType));
    }

    if (isListType(type)) {
      return new GraphQLList(this.replaceTypeReferences(type.ofType));
    }

    // 名前付き型：フィルタリングされた型があればそれを使用
    const filteredType = this.filteredTypeMap.get(type.name);

    // DEBUG
    if (process.env.DEBUG_FIELD_FILTERING) {
      if (!filteredType && !TypeKind.isScalar(type)) {
        console.log(`[DEBUG] replaceTypeReferences(${type.name}): NOT in filteredTypeMap, using original`);
      }
    }

    return (filteredType ?? type) as GraphQLType;
  }
}
