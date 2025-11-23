#!/usr/bin/env bun

/**
 * Example runner script
 * Usage: bun example <type>
 * Example: bun example basic
 */

const type = process.argv[2] || "basic";

const exampleMapping: Record<string, string> = {
  basic: "basic-usage",
  api: "api-integration",
  nested: "nested-types",
  polymorphic: "polymorphic-types",
  disable: "disable-auto-expose",
  inputs: "complex-inputs",
  edge: "edge-cases",
};

const fileName = exampleMapping[type];

if (!fileName) {
  console.error(`❌ Unknown example type: "${type}"`);
  console.error("\nAvailable examples:");
  for (const [key, value] of Object.entries(exampleMapping)) {
    console.error(`  ${key.padEnd(12)} - examples/${value}.ts`);
  }
  process.exit(1);
}

const filePath = new URL(`../examples/${fileName}.ts`, import.meta.url).pathname;

console.log(`Running: examples/${fileName}.ts\n`);

try {
  await import(filePath);
} catch (error) {
  if ((error as any).code === "MODULE_NOT_FOUND" || (error as Error).message.includes("Cannot find module")) {
    console.error(`❌ Example file not found: examples/${fileName}.ts`);
    console.error(`   Please create this file first.`);
  } else {
    console.error(`❌ Error running example:`, error);
  }
  process.exit(1);
}
