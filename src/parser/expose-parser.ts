/**
 * @expose ディレクティブのパースと適用ルールの解決
 */

import {
  GraphQLSchema,
  GraphQLObjectType,
  GraphQLInterfaceType,
  GraphQLInputObjectType,
  GraphQLField,
} from "graphql";
import { TypeKind } from "../utils/type-utils";

/**
 * @expose ディレクティブの情報
 */
export interface ExposeDirective {
  tags: string[];
}

/**
 * フィールドレベルの @expose 情報
 */
interface FieldExposeInfo {
  typeName: string;
  fieldName: string;
  tags: string[];
}

/**
 * @expose ディレクティブパーサー
 */
export class ExposeParser {
  private schema: GraphQLSchema;
  public fieldExposeMap: Map<string, Map<string, string[]>> = new Map();

  constructor(schema: GraphQLSchema) {
    this.schema = schema;
    this.parse();
  }

  /**
   * スキーマから @expose ディレクティブを抽出
   */
  private parse(): void {
    const typeMap = this.schema.getTypeMap();

    for (const [typeName, type] of Object.entries(typeMap)) {
      // Introspection 型や組み込み型はスキップ
      if (typeName.startsWith("__")) continue;

      // Object/Interface 型の処理
      if (TypeKind.isObject(type) || TypeKind.isInterface(type)) {
        this.parseObjectOrInterface(type);
      }
      // InputObject 型の処理
      else if (TypeKind.isInputObject(type)) {
        this.parseInputObject(type);
      }
    }
  }

  /**
   * Object/Interface 型の @expose を解析
   */
  private parseObjectOrInterface(
    type: GraphQLObjectType | GraphQLInterfaceType
  ): void {
    // フィールドレベルの @expose を取得
    const fields = type.getFields();
    for (const [fieldName, field] of Object.entries(fields)) {
      const fieldTags = this.extractTagsFromDirectives(
        field.astNode?.directives ?? []
      );
      if (fieldTags.length > 0) {
        this.setFieldExpose(type.name, fieldName, fieldTags);
      }
    }
  }

  /**
   * InputObject 型の @expose を解析
   */
  private parseInputObject(type: GraphQLInputObjectType): void {
    // InputObject のフィールドレベルの @expose を取得
    const fields = type.getFields();
    for (const [fieldName, field] of Object.entries(fields)) {
      const fieldTags = this.extractTagsFromDirectives(
        field.astNode?.directives ?? []
      );
      if (fieldTags.length > 0) {
        this.setFieldExpose(type.name, fieldName, fieldTags);
      }
    }
  }

  /**
   * AST ノードから @expose ディレクティブのロールを抽出
   */
  private extractTagsFromDirectives(directives: readonly any[]): string[] {
    const allTags: string[] = [];

    for (const directive of directives) {
      if (directive.name.value === "expose") {
        const tagsArg = directive.arguments?.find(
          (arg: any) => arg.name.value === "tags"
        );
        if (tagsArg && tagsArg.value.kind === "ListValue") {
          const tags = tagsArg.value.values.map(
            (v: any) => v.value
          ) as string[];
          allTags.push(...tags);
        }
      }
    }

    return Array.from(new Set(allTags)); // 重複を除去
  }

  /**
   * フィールドレベルの @expose を設定
   */
  private setFieldExpose(
    typeName: string,
    fieldName: string,
    tags: string[]
  ): void {
    if (!this.fieldExposeMap.has(typeName)) {
      this.fieldExposeMap.set(typeName, new Map());
    }
    this.fieldExposeMap.get(typeName)!.set(fieldName, tags);
  }

  /**
   * 指定されたロールがフィールドにアクセス可能かを判定
   *
   * ルール:
   * - フィールドに @expose がある場合、そのロールリストで判定
   * - フィールドに @expose がない場合、公開しない（デフォルト非公開）
   */
  isFieldExposed(typeName: string, fieldName: string, role: string): boolean {
    // フィールドレベルの @expose をチェック
    const fieldTags = this.fieldExposeMap.get(typeName)?.get(fieldName);
    if (fieldTags !== undefined) {
      return fieldTags.includes(role);
    }

    // @expose がない場合は非公開
    return false;
  }

  /**
   * 指定されたロールで公開されるフィールド名のリストを取得
   */
  getExposedFields(typeName: string, role: string): string[] {
    const type = this.schema.getType(typeName);
    if (!type || !(TypeKind.isObject(type) || TypeKind.isInterface(type))) {
      return [];
    }

    const fields = type.getFields();
    const exposedFields: string[] = [];

    for (const [fieldName] of Object.entries(fields)) {
      if (this.isFieldExposed(typeName, fieldName, role)) {
        exposedFields.push(fieldName);
      }
    }

    return exposedFields;
  }

  /**
   * デバッグ用：すべての @expose 情報を出力
   */
  debug(): void {
    console.log("=== Field-level @expose ===");
    for (const [typeName, fieldMap] of this.fieldExposeMap.entries()) {
      for (const [fieldName, tags] of fieldMap.entries()) {
        console.log(`${typeName}.${fieldName}: [${tags.join(", ")}]`);
      }
    }
  }
}
