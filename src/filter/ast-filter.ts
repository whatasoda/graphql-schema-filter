/**
 * AST ベースのスキーマフィルタリング
 */

import type {
  DocumentNode,
  DefinitionNode,
  ObjectTypeDefinitionNode,
  InterfaceTypeDefinitionNode,
  InputObjectTypeDefinitionNode,
  UnionTypeDefinitionNode,
  FieldDefinitionNode,
  InputValueDefinitionNode,
} from "graphql";
import type { SchemaAnalysis } from "../types";
import {
  isFieldExposedFromAST,
  isInputFieldExposedFromAST,
} from "../utils/ast-utils";

/**
 * ObjectTypeDefinition のフィールドをフィルタリング
 *
 * @param typeDef - Object 型定義 AST ノード
 * @param analysis - パース済みの @expose ディレクティブ情報
 * @param role - 対象ロール
 * @returns フィルタリング済みのフィールド配列
 */
function filterObjectFields(
  typeDef: ObjectTypeDefinitionNode,
  analysis: SchemaAnalysis,
  role: string
): readonly FieldDefinitionNode[] | undefined {
  if (!typeDef.fields) {
    return undefined;
  }

  // exposed-only: @expose ルールに基づいてフィルタリング
  return typeDef.fields.filter((field) =>
    isFieldExposedFromAST(typeDef.name.value, field, analysis, role)
  );
}

/**
 * InterfaceTypeDefinition のフィールドをフィルタリング
 *
 * @param typeDef - Interface 型定義 AST ノード
 * @param analysis - パース済みの @expose ディレクティブ情報
 * @param role - 対象ロール
 * @returns フィルタリング済みのフィールド配列
 */
function filterInterfaceFields(
  typeDef: InterfaceTypeDefinitionNode,
  analysis: SchemaAnalysis,
  role: string
): readonly FieldDefinitionNode[] | undefined {
  if (!typeDef.fields) {
    return undefined;
  }

  // exposed-only: @expose ルールに基づいてフィルタリング
  return typeDef.fields.filter((field) =>
    isFieldExposedFromAST(typeDef.name.value, field, analysis, role)
  );
}

/**
 * InputObjectTypeDefinition のフィールドをフィルタリング
 *
 * @param typeDef - InputObject 型定義 AST ノード
 * @param analysis - パース済みの @expose ディレクティブ情報
 * @param role - 対象ロール
 * @returns フィルタリング済みのフィールド配列
 *
 * @remarks
 * InputObject は寛容モード: @expose がない場合はデフォルトで含める
 */
function filterInputObjectFields(
  typeDef: InputObjectTypeDefinitionNode,
  analysis: SchemaAnalysis,
  role: string
): readonly InputValueDefinitionNode[] | undefined {
  if (!typeDef.fields) {
    return undefined;
  }

  return typeDef.fields.filter((field) =>
    isInputFieldExposedFromAST(typeDef.name.value, field, analysis, role)
  );
}

/**
 * ObjectTypeDefinition をフィルタリング
 *
 * @param typeDef - Object 型定義 AST ノード
 * @param analysis - パース済みの @expose ディレクティブ情報
 * @param role - 対象ロール
 * @param config - フィルタリング設定
 * @param reachableTypes - 到達可能な型名の集合
 * @returns フィルタリング済みの Object 型定義、またはフィールドが空の場合 null
 */
function filterObjectTypeDefinition(
  typeDef: ObjectTypeDefinitionNode,
  analysis: SchemaAnalysis,
  role: string,
  reachableTypes: Set<string>
): ObjectTypeDefinitionNode | null {
  const filteredFields = filterObjectFields(typeDef, analysis, role);

  // フィールドが空の場合は型を削除
  if (!filteredFields || filteredFields.length === 0) {
    return null;
  }

  // implements している Interface も到達可能なもののみ残す
  const filteredInterfaces = typeDef.interfaces?.filter((iface) =>
    reachableTypes.has(iface.name.value)
  );

  return {
    ...typeDef,
    fields: filteredFields,
    interfaces: filteredInterfaces,
  };
}

/**
 * InterfaceTypeDefinition をフィルタリング
 *
 * @param typeDef - Interface 型定義 AST ノード
 * @param analysis - パース済みの @expose ディレクティブ情報
 * @param role - 対象ロール
 * @param reachableTypes - 到達可能な型名の集合
 * @returns フィルタリング済みの Interface 型定義、またはフィールドが空の場合 null
 */
function filterInterfaceTypeDefinition(
  typeDef: InterfaceTypeDefinitionNode,
  analysis: SchemaAnalysis,
  role: string,
  reachableTypes: Set<string>
): InterfaceTypeDefinitionNode | null {
  const filteredFields = filterInterfaceFields(typeDef, analysis, role);

  // フィールドが空の場合は型を削除
  if (!filteredFields || filteredFields.length === 0) {
    return null;
  }

  // implements している Interface も到達可能なもののみ残す
  const filteredInterfaces = typeDef.interfaces?.filter((iface) =>
    reachableTypes.has(iface.name.value)
  );

  return {
    ...typeDef,
    fields: filteredFields,
    interfaces: filteredInterfaces,
  };
}

/**
 * InputObjectTypeDefinition をフィルタリング
 *
 * @param typeDef - InputObject 型定義 AST ノード
 * @param analysis - パース済みの @expose ディレクティブ情報
 * @param role - 対象ロール
 * @returns フィルタリング済みの InputObject 型定義、またはフィールドが空の場合 null
 */
function filterInputObjectTypeDefinition(
  typeDef: InputObjectTypeDefinitionNode,
  analysis: SchemaAnalysis,
  role: string
): InputObjectTypeDefinitionNode | null {
  const filteredFields = filterInputObjectFields(typeDef, analysis, role);

  // フィールドが空の場合は型を削除
  if (!filteredFields || filteredFields.length === 0) {
    return null;
  }

  return {
    ...typeDef,
    fields: filteredFields,
  };
}

/**
 * UnionTypeDefinition をフィルタリング
 *
 * @param typeDef - Union 型定義 AST ノード
 * @param reachableTypes - 到達可能な型名の集合
 * @returns フィルタリング済みの Union 型定義、またはメンバーが空の場合 null
 *
 * @remarks
 * Union のメンバー型が到達不可能な場合は除外する
 */
function filterUnionTypeDefinition(
  typeDef: UnionTypeDefinitionNode,
  reachableTypes: Set<string>
): UnionTypeDefinitionNode | null {
  if (!typeDef.types) {
    return null;
  }

  // 到達可能なメンバー型のみ残す
  const filteredTypes = typeDef.types.filter((memberType) =>
    reachableTypes.has(memberType.name.value)
  );

  // メンバーが空の場合は型を削除
  if (filteredTypes.length === 0) {
    return null;
  }

  return {
    ...typeDef,
    types: filteredTypes,
  };
}

/**
 * DocumentNode の definitions をフィルタリング
 *
 * @param documentNode - GraphQL AST DocumentNode
 * @param role - 対象ロール
 * @param reachableTypes - 到達可能な型名の集合
 * @param analysis - パース済みの @expose ディレクティブ情報
 * @returns フィルタリング済みの DefinitionNode 配列
 *
 * @remarks
 * 以下のルールに基づいてフィルタリング:
 * 1. 到達不可能な型は除外
 * 2. Object/Interface/InputObject 型はフィールドレベルでフィルタリング
 * 3. Scalar/Enum/Union 型は到達可能であればそのまま含める
 * 4. Directive 定義は常に含める
 */
export function filterDefinitionsAST(
  documentNode: DocumentNode,
  role: string,
  reachableTypes: Set<string>,
  analysis: SchemaAnalysis
): DefinitionNode[] {
  return documentNode.definitions
    .map((def) => {
      // Directive 定義はそのまま含める
      if (def.kind === "DirectiveDefinition") {
        return def;
      }

      // Schema 定義は除外（buildASTSchema が自動生成）
      if (def.kind === "SchemaDefinition") {
        return null;
      }

      // 型定義以外はそのまま含める
      if (
        def.kind !== "ObjectTypeDefinition" &&
        def.kind !== "InterfaceTypeDefinition" &&
        def.kind !== "InputObjectTypeDefinition" &&
        def.kind !== "UnionTypeDefinition" &&
        def.kind !== "EnumTypeDefinition" &&
        def.kind !== "ScalarTypeDefinition"
      ) {
        return def;
      }

      // Root 型（Query/Mutation/Subscription）は常に含める（フィールドが空でも）
      const isRootType =
        def.name.value === analysis.rootTypeNames.query ||
        def.name.value === analysis.rootTypeNames.mutation ||
        def.name.value === analysis.rootTypeNames.subscription;

      // 到達不可能な型は除外（ただし Root 型は除く）
      if (!isRootType && !reachableTypes.has(def.name.value)) {
        return null;
      }

      // Object 型のフィールドフィルタリング
      if (def.kind === "ObjectTypeDefinition") {
        const filtered = filterObjectTypeDefinition(
          def,
          analysis,
          role,
          reachableTypes
        );

        // Root 型の場合、フィールドが空でも型定義を保持
        if (isRootType && filtered === null) {
          return {
            ...def,
            fields: [],
          };
        }

        return filtered;
      }

      // Interface 型のフィールドフィルタリング
      if (def.kind === "InterfaceTypeDefinition") {
        return filterInterfaceTypeDefinition(
          def,
          analysis,
          role,
          reachableTypes
        );
      }

      // InputObject 型のフィールドフィルタリング
      if (def.kind === "InputObjectTypeDefinition") {
        return filterInputObjectTypeDefinition(def, analysis, role);
      }

      // Union 型のメンバーフィルタリング
      if (def.kind === "UnionTypeDefinition") {
        return filterUnionTypeDefinition(def, reachableTypes);
      }

      // Scalar/Enum はそのまま含める
      return def;
    })
    .filter((def) => def != null);
}
