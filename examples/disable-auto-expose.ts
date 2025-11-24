/**
 * @disableAutoExpose ディレクティブのテスト
 *
 * 検証ポイント:
 * - @disableAutoExpose が正しく動作するか
 * - ネストした Query 構造が実用的に使えるか
 * - 明示的に除外されるフィールドが本当に除外されるか
 *
 * 実行方法:
 *   bun example disable
 */

import { buildSchema, printSchema } from "graphql";
import { filterSchemaForTarget } from "../src";

const schema = buildSchema(`
  directive @expose(tags: [String!]!) repeatable on FIELD_DEFINITION | INPUT_FIELD_DEFINITION
  directive @disableAutoExpose on OBJECT | INTERFACE

  type Query {
    user: UserQueries @expose(tags: ["public"])
    admin: AdminQueries @expose(tags: ["admin"])
  }

  # @disableAutoExpose で明示的な制御
  type UserQueries @disableAutoExpose {
    me: User @expose(tags: ["authenticated"])
    profile(id: ID!): User @expose(tags: ["public"])
    # これは除外される（@expose なし）
    internalUserLookup(email: String!): User
  }

  type AdminQueries @disableAutoExpose {
    users: [User!]! @expose(tags: ["admin"])
    analytics: Analytics @expose(tags: ["admin"])
    # これは除外される（@expose なし）
    debugInfo: String
  }

  # 通常の型（デフォルト公開）
  type User {
    id: ID!
    name: String!
    email: String!
  }

  type Analytics {
    totalUsers: Int!
    activeUsers: Int!
  }
`);

async function main() {
  console.log("=== @disableAutoExpose Test ===\n");

  // public ターゲット用にフィルタリング
  console.log('🔍 Filtering for "public" target...\n');
  const publicSchema = await filterSchemaForTarget(schema, {
    target: "public",
    autoInferEntryPoints: true,
  });

  console.log("📋 Filtered Schema (public):\n");
  console.log(printSchema(publicSchema));
  console.log("\n" + "=".repeat(60) + "\n");

  // authenticated ターゲット用にフィルタリング
  console.log('🔍 Filtering for "authenticated" target...\n');
  const authSchema = await filterSchemaForTarget(schema, {
    target: "authenticated",
    autoInferEntryPoints: true,
  });

  console.log("📋 Filtered Schema (authenticated):\n");
  console.log(printSchema(authSchema));
  console.log("\n" + "=".repeat(60) + "\n");

  // admin ターゲット用にフィルタリング
  console.log('🔍 Filtering for "admin" target...\n');
  const adminSchema = await filterSchemaForTarget(schema, {
    target: "admin",
    autoInferEntryPoints: true,
  });

  console.log("📋 Filtered Schema (admin):\n");
  console.log(printSchema(adminSchema));

  // 結果の検証
  console.log("\n" + "=".repeat(60));
  console.log("\n📊 Verification:");

  const publicUserQueries = publicSchema.getType("UserQueries");
  const authUserQueries = authSchema.getType("UserQueries");
  const adminUserQueries = adminSchema.getType("UserQueries");

  if (publicUserQueries && "getFields" in publicUserQueries) {
    const fields = Object.keys(publicUserQueries.getFields());
    console.log(`  public UserQueries fields: ${fields.join(", ")}`);
    console.log(
      `    ✓ internalUserLookup excluded: ${!fields.includes(
        "internalUserLookup"
      )}`
    );
  }

  if (authUserQueries && "getFields" in authUserQueries) {
    const fields = Object.keys(authUserQueries.getFields());
    console.log(`  authenticated UserQueries fields: ${fields.join(", ")}`);
    console.log(`    ✓ me included: ${fields.includes("me")}`);
    console.log(
      `    ✓ internalUserLookup excluded: ${!fields.includes(
        "internalUserLookup"
      )}`
    );
  }

  if (adminUserQueries && "getFields" in adminUserQueries) {
    const fields = Object.keys(adminUserQueries.getFields());
    console.log(`  admin UserQueries fields: ${fields.join(", ")}`);
  }
}

main().catch((error) => {
  console.error("❌ Error:", error);
  process.exit(1);
});
