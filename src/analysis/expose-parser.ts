/**
 * @expose ディレクティブのパースと適用ルールの解決
 */

import {
  GraphQLSchema,
  isObjectType,
  isInterfaceType,
  isInputObjectType,
  isIntrospectionType,
} from "graphql";
import type { SchemaAnalysis, TypeLevelExposureInfo } from "../types";
import {
  createExposureInfoFromObjectType,
  createExposureInfoFromInterfaceType,
  createExposureInfoFromInputObjectType,
} from "./exposure-info";

/**
 * スキーマから @expose ディレクティブを解析
 *
 * @param schema - GraphQLスキーマ
 * @returns 解析済みの @expose ディレクティブ情報
 */
export function createSchemaAnalysis(schema: GraphQLSchema): SchemaAnalysis {
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
    ].filter((name) => name !== null)
  );

  const exposureInfoList = Object.values(
    schema.getTypeMap()
  ).flatMap<TypeLevelExposureInfo>((type) => {
    if (isIntrospectionType(type)) return [];

    if (isObjectType(type)) {
      return createExposureInfoFromObjectType({ type, rootTypeNameSet }) ?? [];
    }

    if (isInterfaceType(type)) {
      return createExposureInfoFromInterfaceType({ type }) ?? [];
    }

    if (isInputObjectType(type)) {
      return createExposureInfoFromInputObjectType({ type }) ?? [];
    }

    return [];
  });

  return {
    rootTypeNames,
    exposureInfoMap: new Map(
      exposureInfoList.map((info) => [info.typeName, info])
    ),
  };
}

/**
 * デバッグ用：すべての @expose 情報を出力
 *
 * @param analysis - SchemaAnalysis 情報
 */
export function debugSchemaAnalysis(analysis: SchemaAnalysis): void {
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
