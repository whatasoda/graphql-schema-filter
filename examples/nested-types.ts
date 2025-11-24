/**
 * ネストした型構造とリレーションのテスト
 *
 * 検証ポイント:
 * - ネストした型が正しく reachable になるか
 * - リレーション先の型のフィールドが正しくフィルタリングされるか
 * - 自己参照型が無限ループにならないか
 *
 * 実行方法:
 *   bun run examples/nested-types.ts
 */

import { buildSchema, printSchema } from "graphql";
import { filterSchemaForTarget } from "../src";

const schema = buildSchema(`
  directive @expose(tags: [String!]!) repeatable on FIELD_DEFINITION | INPUT_FIELD_DEFINITION
  directive @disableAutoExpose on OBJECT | INTERFACE

  type Query {
    organization(id: ID!): Organization @expose(tags: ["member", "admin"])
  }

  type Organization {
    id: ID!
    name: String!
    # ネストしたリレーション（デフォルト公開）
    teams: [Team!]!
    # admin のみ
    billing: BillingInfo @expose(tags: ["admin"])
  }

  type Team {
    id: ID!
    name: String!
    members: [User!]!
    # team-lead 以上
    privateNotes: String @expose(tags: ["team-lead", "admin"])
  }

  type User {
    id: ID!
    name: String!
    email: String!
    # 自己参照
    manager: User
    directReports: [User!]
  }

  type BillingInfo {
    plan: String!
    # デフォルト公開されてしまう（これは意図通り？）
    creditCard: String
    # 明示的に除外
    internalNotes: String @expose(tags: [])
  }
`);

async function main() {
  console.log("=== Nested Types Test ===\n");

  // member ターゲット用にフィルタリング
  console.log('🔍 Filtering for "member" target...\n');
  const memberSchema = await filterSchemaForTarget(schema, {
    target: "member",
  });

  console.log("📋 Filtered Schema (member):\n");
  console.log(printSchema(memberSchema));
  console.log("\n" + "=".repeat(60) + "\n");

  // admin ターゲット用にフィルタリング
  console.log('🔍 Filtering for "admin" target...\n');
  const adminSchema = await filterSchemaForTarget(schema, {
    target: "admin",
  });

  console.log("📋 Filtered Schema (admin):\n");
  console.log(printSchema(adminSchema));
  console.log("\n" + "=".repeat(60) + "\n");

  // team-lead ターゲット用にフィルタリング
  console.log('🔍 Filtering for "team-lead" target...\n');
  const teamLeadSchema = await filterSchemaForTarget(schema, {
    target: "team-lead",
  });

  console.log("📋 Filtered Schema (team-lead):\n");
  console.log(printSchema(teamLeadSchema));

  // 結果の検証
  console.log("\n" + "=".repeat(60));
  console.log("\n📊 Verification:");

  const memberTypes = Object.keys(memberSchema.getTypeMap()).filter(
    (name) => !name.startsWith("__")
  );
  const adminTypes = Object.keys(adminSchema.getTypeMap()).filter(
    (name) => !name.startsWith("__")
  );

  console.log(
    `  member types: ${memberTypes.length} - ${memberTypes.join(", ")}`
  );
  console.log(`  admin types: ${adminTypes.length} - ${adminTypes.join(", ")}`);

  // BillingInfo が member に含まれていないことを確認
  console.log(
    `\n  ✓ BillingInfo in member schema: ${memberTypes.includes("BillingInfo")}`
  );
  console.log(
    `  ✓ BillingInfo in admin schema: ${adminTypes.includes("BillingInfo")}`
  );
}

main().catch((error) => {
  console.error("❌ Error:", error);
  process.exit(1);
});
