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

/**
 * AST FieldDefinitionNode から指定されたターゲットがフィールドにアクセス可能かを判定
 *
 * @param typeName - 親型の名前
 * @param field - フィールド定義 AST ノード
 * @param analysis - SchemaAnalysis 情報
 * @param target - ターゲット名
 * @returns フィールドが公開されている場合 true
 *
 * @remarks
 * ルール:
 * - フィールドに @expose がある場合、そのターゲットリストで判定
 * - フィールドに @expose がない場合:
 *   - Query/Mutation/Subscription 型: 非公開（除外）
 *   - @disableAutoExpose が付いた型: 非公開（除外）
 *   - その他の output type: 公開（デフォルト公開）
 */
export function isFieldExposedFromAST({
  typeName,
  field,
  analysis,
  target,
}: {
  typeName: string;
  field: FieldDefinitionNode | InputValueDefinitionNode;
  analysis: SchemaAnalysis;
  target: string;
}): boolean {
  const exposureInfo = analysis.exposureInfoMap.get(typeName);
  if (!exposureInfo) {
    return false;
  }

  // フィールドレベルの @expose をチェック
  const fieldInfo = exposureInfo.fields.get(field.name.value);
  if (fieldInfo !== undefined) {
    return fieldInfo.tags.includes(target);
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
 * ObjectTypeDefinition のフィールドをフィルタリング
 *
 * @param typeDef - Object 型定義 AST ノード
 * @param analysis - パース済みの @expose ディレクティブ情報
 * @param target - 対象ターゲット
 * @returns フィルタリング済みのフィールド配列
 */
function filterObjectFields(
  typeDef: ObjectTypeDefinitionNode,
  analysis: SchemaAnalysis,
  target: string
): readonly FieldDefinitionNode[] | undefined {
  if (!typeDef.fields) {
    return undefined;
  }

  // exposed-only: @expose ルールに基づいてフィルタリング
  return typeDef.fields.filter((field) =>
    isFieldExposedFromAST({
      typeName: typeDef.name.value,
      field,
      analysis,
      target,
    })
  );
}

/**
 * InterfaceTypeDefinition のフィールドをフィルタリング
 *
 * @param typeDef - Interface 型定義 AST ノード
 * @param analysis - パース済みの @expose ディレクティブ情報
 * @param target - 対象ターゲット
 * @returns フィルタリング済みのフィールド配列
 */
function filterInterfaceFields(
  typeDef: InterfaceTypeDefinitionNode,
  analysis: SchemaAnalysis,
  target: string
): readonly FieldDefinitionNode[] | undefined {
  if (!typeDef.fields) {
    return undefined;
  }

  // exposed-only: @expose ルールに基づいてフィルタリング
  return typeDef.fields.filter((field) =>
    isFieldExposedFromAST({
      typeName: typeDef.name.value,
      field,
      analysis,
      target,
    })
  );
}

/**
 * InputObjectTypeDefinition のフィールドをフィルタリング
 *
 * @param typeDef - InputObject 型定義 AST ノード
 * @param analysis - パース済みの @expose ディレクティブ情報
 * @param target - 対象ターゲット
 * @returns フィルタリング済みのフィールド配列
 *
 * @remarks
 * InputObject は寛容モード: @expose がない場合はデフォルトで含める
 */
function filterInputObjectFields(
  typeDef: InputObjectTypeDefinitionNode,
  analysis: SchemaAnalysis,
  target: string
): readonly InputValueDefinitionNode[] | undefined {
  if (!typeDef.fields) {
    return undefined;
  }

  return typeDef.fields.filter((field) =>
    isFieldExposedFromAST({
      typeName: typeDef.name.value,
      field,
      analysis,
      target,
    })
  );
}

/**
 * ObjectTypeDefinition をフィルタリング
 *
 * @param typeDef - Object 型定義 AST ノード
 * @param analysis - パース済みの @expose ディレクティブ情報
 * @param target - 対象ターゲット
 * @param config - フィルタリング設定
 * @param reachableTypes - 到達可能な型名の集合
 * @returns フィルタリング済みの Object 型定義、またはフィールドが空の場合 null
 */
function filterObjectTypeDefinition(
  typeDef: ObjectTypeDefinitionNode,
  analysis: SchemaAnalysis,
  target: string,
  reachableTypes: Set<string>
): ObjectTypeDefinitionNode | null {
  const filteredFields = filterObjectFields(typeDef, analysis, target);

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
 * @param target - 対象ターゲット
 * @param reachableTypes - 到達可能な型名の集合
 * @returns フィルタリング済みの Interface 型定義、またはフィールドが空の場合 null
 */
function filterInterfaceTypeDefinition(
  typeDef: InterfaceTypeDefinitionNode,
  analysis: SchemaAnalysis,
  target: string,
  reachableTypes: Set<string>
): InterfaceTypeDefinitionNode | null {
  const filteredFields = filterInterfaceFields(typeDef, analysis, target);

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
 * @param target - 対象ターゲット
 * @returns フィルタリング済みの InputObject 型定義、またはフィールドが空の場合 null
 */
function filterInputObjectTypeDefinition(
  typeDef: InputObjectTypeDefinitionNode,
  analysis: SchemaAnalysis,
  target: string
): InputObjectTypeDefinitionNode | null {
  const filteredFields = filterInputObjectFields(typeDef, analysis, target);

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
 * @param target - 対象ターゲット
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
  target: string,
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
          target,
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
          target,
          reachableTypes
        );
      }

      // InputObject 型のフィールドフィルタリング
      if (def.kind === "InputObjectTypeDefinition") {
        return filterInputObjectTypeDefinition(def, analysis, target);
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
