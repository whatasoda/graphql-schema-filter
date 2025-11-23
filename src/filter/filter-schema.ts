/**
 * メインスキーマフィルタリング関数
 *
 * 到達可能性アナライザー、@expose パーサー、スキーマフィルターを統合
 */

import { GraphQLSchema, getNamedType } from "graphql";
import {
  ReachabilityAnalyzer,
  ReachabilityConfig,
} from "../analyzer/reachability";
import { ExposeParser } from "../parser/expose-parser";
import { SchemaFilter, SchemaFilterConfig } from "./schema-filter";

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

/**
 * スキーマをフィルタリングして、指定ロール用のスキーマを生成
 */
export async function filterSchemaForRole(
  schema: GraphQLSchema,
  options: FilterSchemaOptions
): Promise<GraphQLSchema> {
  const {
    role,
    autoInferEntryPoints = true,
    entryPoints,
    reachabilityConfig,
    filterConfig,
  } = options;

  // 1. @expose ディレクティブをパース
  const exposeParser = new ExposeParser(schema);

  // DEBUG: パース結果を出力
  if (process.env.DEBUG_EXPOSE_PARSER) {
    exposeParser.debug();
  }

  // 2. 開始点を決定
  let finalEntryPoints: {
    queries: string[];
    mutations: string[];
    types: string[];
  };

  if (autoInferEntryPoints) {
    // @expose ディレクティブから自動推論
    finalEntryPoints = inferEntryPointsFromExpose(schema, role, exposeParser);
    console.log(`Auto-inferred entry points for role "${role}":`);
    console.log(`  Queries: [${finalEntryPoints.queries.join(", ")}]`);
    console.log(`  Mutations: [${finalEntryPoints.mutations.join(", ")}]`);
    console.log(`  Types: [${finalEntryPoints.types.join(", ")}]`);
  } else {
    finalEntryPoints = {
      queries: entryPoints?.queries ?? [],
      mutations: entryPoints?.mutations ?? [],
      types: entryPoints?.types ?? [],
    };
  }

  // 3. 到達可能な型を計算
  const analyzer = new ReachabilityAnalyzer(schema, reachabilityConfig);

  finalEntryPoints.queries.forEach((queryName) => {
    analyzer.addRootField("Query", queryName);
  });

  finalEntryPoints.mutations.forEach((mutationName) => {
    analyzer.addRootField("Mutation", mutationName);
  });

  finalEntryPoints.types.forEach((typeName) => {
    analyzer.addType(typeName);
  });

  const reachableTypes = analyzer.computeClosure();
  console.log(`Reachable types: ${reachableTypes.size}`);

  // 4. スキーマをフィルタリング
  const filter = new SchemaFilter(schema, role, reachableTypes, filterConfig);
  const filteredSchema = filter.buildFilteredSchema();

  console.log(`Filtered schema created for role "${role}"`);

  return filteredSchema;
}

/**
 * @expose ディレクティブから開始点を自動推論
 */
function inferEntryPointsFromExpose(
  schema: GraphQLSchema,
  role: string,
  exposeParser: ExposeParser
): {
  queries: string[];
  mutations: string[];
  types: string[];
} {
  const queries: string[] = [];
  const mutations: string[] = [];
  const types: string[] = [];

  // Query 型から公開されているフィールドを収集
  const queryType = schema.getQueryType();
  if (queryType) {
    const queryFields = queryType.getFields();
    for (const [fieldName, field] of Object.entries(queryFields)) {
      if (exposeParser.isFieldExposed("Query", fieldName, role)) {
        queries.push(fieldName);
        // Query フィールドの返り値型をエントリーポイントに追加
        const returnType = getNamedType(field.type);
        if (!types.includes(returnType.name)) {
          types.push(returnType.name);
        }
      }
    }
  }

  // Mutation 型から公開されているフィールドを収集
  const mutationType = schema.getMutationType();
  if (mutationType) {
    const mutationFields = mutationType.getFields();
    for (const [fieldName, field] of Object.entries(mutationFields)) {
      if (exposeParser.isFieldExposed("Mutation", fieldName, role)) {
        mutations.push(fieldName);
        // Mutation フィールドの返り値型をエントリーポイントに追加
        const returnType = getNamedType(field.type);
        if (!types.includes(returnType.name)) {
          types.push(returnType.name);
        }
      }
    }
  }

  return { queries, mutations, types };
}
