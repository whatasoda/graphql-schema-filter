/**
 * Interface と Union 型のテスト
 *
 * 検証ポイント:
 * - Interface のフィールドフィルタリング
 * - Interface を実装する型が正しく reachable になるか
 * - Union 型のメンバーが正しく含まれるか
 *
 * 実行方法:
 *   bun example polymorphic
 */

import { buildSchema, printSchema } from "graphql";
import { filterSchemaForRole } from "../src";

const schema = buildSchema(`
  directive @expose(tags: [String!]!) repeatable on FIELD_DEFINITION | INPUT_FIELD_DEFINITION
  directive @disableAutoExpose on OBJECT | INTERFACE

  type Query {
    search(query: String!): [SearchResult!]! @expose(tags: ["public"])
    node(id: ID!): Node @expose(tags: ["public"])
    adminContent: [Content!]! @expose(tags: ["admin"])
  }

  interface Node {
    id: ID!
    createdAt: String!
  }

  interface Content {
    id: ID!
    title: String!
    # admin のみ
    internal: String @expose(tags: ["admin"])
  }

  type Article implements Node & Content {
    id: ID!
    createdAt: String!
    title: String!
    content: String!
    # author のみ編集可能
    draft: String @expose(tags: ["author", "admin"])
    internal: String
  }

  type Comment implements Node {
    id: ID!
    createdAt: String!
    text: String!
    # moderator のみ
    reportCount: Int @expose(tags: ["moderator", "admin"])
  }

  type Video implements Content {
    id: ID!
    title: String!
    url: String!
    # admin のみ
    rawFile: String @expose(tags: ["admin"])
    internal: String
  }

  union SearchResult = Article | Comment | Video
`);

async function main() {
  console.log("=== Polymorphic Types Test ===\n");

  // public ロール用にフィルタリング
  console.log('🔍 Filtering for "public" role...\n');
  const publicSchema = await filterSchemaForRole(schema, {
    role: "public",
    autoInferEntryPoints: true,
  });

  console.log("📋 Filtered Schema (public):\n");
  console.log(printSchema(publicSchema));
  console.log("\n" + "=".repeat(60) + "\n");

  // admin ロール用にフィルタリング
  console.log('🔍 Filtering for "admin" role...\n');
  const adminSchema = await filterSchemaForRole(schema, {
    role: "admin",
    autoInferEntryPoints: true,
  });

  console.log("📋 Filtered Schema (admin):\n");
  console.log(printSchema(adminSchema));
  console.log("\n" + "=".repeat(60) + "\n");

  // 結果の検証
  console.log("📊 Verification:");

  const publicTypes = Object.keys(publicSchema.getTypeMap()).filter(
    (name) => !name.startsWith("__")
  );
  const adminTypes = Object.keys(adminSchema.getTypeMap()).filter(
    (name) => !name.startsWith("__")
  );

  console.log(`  public types: ${publicTypes.length} - ${publicTypes.join(", ")}`);
  console.log(`  admin types: ${adminTypes.length} - ${adminTypes.join(", ")}`);

  // Interface が含まれているか確認
  console.log(
    `\n  ✓ Node interface in public schema: ${publicTypes.includes("Node")}`
  );
  console.log(
    `  ✓ Content interface in admin schema: ${adminTypes.includes("Content")}`
  );
  console.log(
    `  ✓ SearchResult union in public schema: ${publicTypes.includes("SearchResult")}`
  );

  // Article が Interface を実装しているか確認
  const publicArticle = publicSchema.getType("Article");
  if (publicArticle && "getInterfaces" in publicArticle) {
    const interfaces = publicArticle.getInterfaces();
    console.log(
      `  ✓ Article implements: ${interfaces.map((i) => i.name).join(", ")}`
    );
  }
}

main().catch((error) => {
  console.error("❌ Error:", error);
  process.exit(1);
});
