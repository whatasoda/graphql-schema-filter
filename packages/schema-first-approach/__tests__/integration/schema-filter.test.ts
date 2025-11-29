import { describe, test, expect } from "bun:test";
import { printSchema } from "graphql";
import { createSchemaFilter } from "../../src";
import path from "path";

const fixturesDir = path.join(__dirname, "../fixtures");

describe("createSchemaFilter", () => {
  describe("getSourceAst", () => {
    test("collects and parses multiple .graphql files", async () => {
      const schemaFilter = createSchemaFilter({
        patterns: [path.join(fixturesDir, "basic/**/*.graphql")],
      });

      const result = await schemaFilter.getSourceAst();

      expect(result.type).toBe("parsed");
      if (result.type === "parsed") {
        expect(result.raw).toContain("type Query");
        expect(result.raw).toContain("type User");
        expect(result.parsed.definitions.length).toBeGreaterThan(0);
      }
    });

    test("returns error result when pattern matches no files", async () => {
      const schemaFilter = createSchemaFilter({
        patterns: [path.join(fixturesDir, "nonexistent/**/*.graphql")],
      });

      const result = await schemaFilter.getSourceAst();

      // When no files are found, parsing empty string will fail
      expect(result.type).toBe("error");
    });
  });

  describe("getFilteredSchema", () => {
    test("returns filtered schema based on target", async () => {
      const schemaFilter = createSchemaFilter({
        patterns: [path.join(fixturesDir, "basic/**/*.graphql")],
      });

      const filteredSchema = await schemaFilter.getFilteredSchema({
        target: "public",
      });

      const printed = printSchema(filteredSchema);
      expect(printed).toContain("type Query");
      expect(printed).toContain("users");
      expect(printed).toContain("type User");
    });

    test("strips unknown directives from schema", async () => {
      const schemaFilter = createSchemaFilter({
        patterns: [path.join(fixturesDir, "with-unknown-directives/**/*.graphql")],
      });

      const filteredSchema = await schemaFilter.getFilteredSchema({
        target: "public",
      });

      const printed = printSchema(filteredSchema);
      // Schema should be built successfully without unknown directives
      expect(printed).toContain("type Query");
      expect(printed).toContain("type User");
      // Unknown directives should not cause errors
      expect(printed).not.toContain("@someUnknownDirective");
    });

    test("correctly processes extend type Query", async () => {
      const schemaFilter = createSchemaFilter({
        patterns: [path.join(fixturesDir, "with-extend/**/*.graphql")],
      });

      const filteredSchema = await schemaFilter.getFilteredSchema({
        target: "public",
      });

      const printed = printSchema(filteredSchema);

      // Both original and extended Query fields should be present
      expect(printed).toContain("type Query");
      expect(printed).toContain("users");
      expect(printed).toContain("posts");

      // Both types should be reachable
      expect(printed).toContain("type User");
      expect(printed).toContain("type Post");
    });
  });
});
