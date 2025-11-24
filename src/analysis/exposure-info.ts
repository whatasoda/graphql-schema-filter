import {
  GraphQLObjectType,
  GraphQLInterfaceType,
  GraphQLInputObjectType,
  GraphQLInputField,
  GraphQLField,
} from "graphql";
import {
  hasDisableAutoExposeDirective,
  extractExposureTags,
} from "./directive";
import type { TypeLevelExposureInfo, FieldLevelExposureInfo } from "../types";

export function createExposureInfoFromObjectType({
  type,
  rootTypeNameSet,
}: {
  type: GraphQLObjectType;
  rootTypeNameSet: Set<string>;
}): TypeLevelExposureInfo | null {
  return {
    typeName: type.name,
    isRootType: rootTypeNameSet.has(type.name),
    isAutoExposeDisabled: hasDisableAutoExposeDirective({
      directives: type.astNode?.directives,
    }),
    fields: createFieldLevelExposureInfoMapFromFieldLike({
      fields: Object.values(type.getFields()),
    }),
  };
}

export function createExposureInfoFromInterfaceType({
  type,
}: {
  type: GraphQLInterfaceType;
}): TypeLevelExposureInfo | null {
  return {
    typeName: type.name,
    // NOTE: Interface types are never root types
    isRootType: false,
    // NOTE: Interface types are never auto-exposed
    isAutoExposeDisabled: false,
    fields: createFieldLevelExposureInfoMapFromFieldLike({
      fields: Object.values(type.getFields()),
    }),
  };
}

export function createExposureInfoFromInputObjectType({
  type,
}: {
  type: GraphQLInputObjectType;
}): TypeLevelExposureInfo | null {
  return {
    typeName: type.name,
    // NOTE: InputObject types are never root types
    isRootType: false,
    // NOTE: InputObject types are never auto-exposed
    isAutoExposeDisabled: false,
    fields: createFieldLevelExposureInfoMapFromFieldLike({
      fields: Object.values(type.getFields()),
    }),
  };
}

function createFieldLevelExposureInfoMapFromFieldLike({
  fields,
}: {
  fields: GraphQLInputField[] | GraphQLField<unknown, unknown>[];
}): Map<string, FieldLevelExposureInfo> {
  return new Map(
    fields
      .flatMap<FieldLevelExposureInfo>((field) => {
        const fieldTags = extractExposureTags({
          directives: field.astNode?.directives,
        });

        return fieldTags ? [{ fieldName: field.name, tags: fieldTags }] : [];
      })
      .map((fieldInfo) => [fieldInfo.fieldName, fieldInfo])
  );
}
