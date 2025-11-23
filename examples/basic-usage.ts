/**
 * 基本的な使用例
 *
 * buildSchema で作成したスキーマを @expose ディレクティブに基づいてフィルタリング
 *
 * 実行方法:
 *   bun run examples/basic-usage.ts
 */

import { buildSchema, printSchema } from "graphql";
import { filterSchemaForRole } from "../src";

// サンプルスキーマを定義
const schema = buildSchema(`
  directive @expose(tags: [String!]!) repeatable on FIELD_DEFINITION | INPUT_FIELD_DEFINITION

  type Query {
    users: [User!]! @expose(tags: ["readonly", "admin"])
    adminUsers: [User!]! @expose(tags: ["admin"])
    createUser(input: CreateUserInput!): User! @expose(tags: ["admin"])
  }

  type User {
    id: ID! @expose(tags: ["readonly", "admin"])
    name: String! @expose(tags: ["readonly", "admin"])
    email: String! @expose(tags: ["readonly", "admin"])
    # admin のみがアクセス可能
    salary: Float @expose(tags: ["admin"])
    # @expose なしのフィールドはフィルタリングで除外される
    password: String
  }

  input CreateUserInput {
    name: String!
    email: String!
    # admin のみが設定可能（@expose がある場合のみ制限）
    salary: Float @expose(tags: ["admin"])
    # @expose なしのフィールドはデフォルトで含まれる（寛容モード）
    password: String
  }
`);

async function main() {
  console.log("=== GraphQL Schema Extract - Basic Usage Example ===\n");

  // readonly ロール用にフィルタリング
  console.log('🔍 Filtering for "readonly" role...\n');
  const readonlySchema = await filterSchemaForRole(schema, {
    role: "readonly",
    autoInferEntryPoints: true,
  });

  console.log("📋 Filtered Schema (readonly):\n");
  console.log(printSchema(readonlySchema));
  console.log("\n" + "=".repeat(60) + "\n");

  // admin ロール用にフィルタリング
  console.log('🔍 Filtering for "admin" role...\n');
  const adminSchema = await filterSchemaForRole(schema, {
    role: "admin",
    autoInferEntryPoints: true,
  });

  console.log("📋 Filtered Schema (admin):\n");
  console.log(printSchema(adminSchema));

  // 統計情報
  const readonlyTypes = Object.keys(readonlySchema.getTypeMap()).filter(
    (name) => !name.startsWith("__")
  );
  const adminTypes = Object.keys(adminSchema.getTypeMap()).filter(
    (name) => !name.startsWith("__")
  );

  console.log("\n" + "=".repeat(60));
  console.log("\n📊 Statistics:");
  console.log(`  readonly types: ${readonlyTypes.length}`);
  console.log(`  admin types: ${adminTypes.length}`);

  const readonlyQueryFields = Object.keys(
    readonlySchema.getQueryType()?.getFields() ?? {}
  );
  const adminQueryFields = Object.keys(
    adminSchema.getQueryType()?.getFields() ?? {}
  );

  console.log(`  readonly query fields: ${readonlyQueryFields.length}`);
  console.log(`  admin query fields: ${adminQueryFields.length}`);
}

main().catch((error) => {
  console.error("❌ Error:", error);
  process.exit(1);
});
