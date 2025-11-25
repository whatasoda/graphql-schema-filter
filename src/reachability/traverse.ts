import {
  getNamedType,
  GraphQLEnumType,
  GraphQLInputObjectType,
  GraphQLInputType,
  GraphQLInterfaceType,
  GraphQLNamedType,
  GraphQLObjectType,
  GraphQLOutputType,
  GraphQLScalarType,
  GraphQLSchema,
  GraphQLUnionType,
  isObjectType,
  isInterfaceType,
  isUnionType,
  isInputObjectType,
  isScalarType,
  isEnumType,
  isIntrospectionType,
} from "graphql";

interface TraversalItemBase {
  children: GraphQLNamedType[];
}

interface TraversalItem__ObjectField extends TraversalItemBase {
  source: "objectField";
  fieldType: GraphQLOutputType;
  typeName: string;
  fieldName: string;
}

interface TraversalItem__InterfaceField extends TraversalItemBase {
  source: "interfaceField";
  fieldType: GraphQLOutputType;
  typeName: string;
  fieldName: string;
}

interface TraversalItem__InputField extends TraversalItemBase {
  source: "inputField";
  fieldType: GraphQLInputType;
  typeName: string;
  fieldName: string;
}

interface TraversalItem__InterfaceImplementedByObject
  extends TraversalItemBase {
  source: "interfaceImplementedByObject";
  interfaceType: GraphQLInterfaceType;
  typeName: string;
}

interface TraversalItem__ObjectTypeImplementingInterface
  extends TraversalItemBase {
  source: "objectImplementingInterface";
  objectType: GraphQLObjectType;
  typeName: string;
}

interface TraversalItem__UnionMember extends TraversalItemBase {
  source: "unionMember";
  memberType: GraphQLObjectType;
  unionName: string;
}

type TraverseOutput =
  | TraversalItem__ObjectField
  | TraversalItem__InterfaceField
  | TraversalItem__InputField
  | TraversalItem__InterfaceImplementedByObject
  | TraversalItem__UnionMember
  | TraversalItem__ObjectTypeImplementingInterface;

export function createTypeTraverserInternal(schema: GraphQLSchema) {
  return {
    *traverseObject(type: GraphQLObjectType): Generator<TraverseOutput> {
      for (const field of Object.values(type.getFields())) {
        const fieldType = getNamedType(field.type);

        yield {
          source: "objectField" as const,
          children: [
            fieldType,
            ...field.args.map((arg) => getNamedType(arg.type)),
          ],
          fieldType,
          typeName: type.name,
          fieldName: field.name,
        };
      }

      for (const interface_ of type.getInterfaces()) {
        yield {
          source: "interfaceImplementedByObject" as const,
          children: [interface_],
          interfaceType: interface_,
          typeName: type.name,
        };
      }
    },

    *traverseInterface(type: GraphQLInterfaceType): Generator<TraverseOutput> {
      for (const field of Object.values(type.getFields())) {
        const fieldType = getNamedType(field.type);

        yield {
          source: "interfaceField" as const,
          children: [
            fieldType,
            ...field.args.map((arg) => getNamedType(arg.type)),
          ],
          fieldType,
          typeName: type.name,
          fieldName: field.name,
        };
      }

      // Yield interface implementations (possible types)
      for (const implementationType of schema.getPossibleTypes(type)) {
        yield {
          source: "objectImplementingInterface" as const,
          children: [implementationType],
          objectType: implementationType,
          typeName: type.name,
        };
      }
    },

    *traverseUnion(type: GraphQLUnionType): Generator<TraverseOutput> {
      for (const memberType of schema.getPossibleTypes(type)) {
        yield {
          source: "unionMember" as const,
          children: [memberType],
          memberType: memberType,
          unionName: type.name,
        };
      }
    },

    *traverseInputObject(
      type: GraphQLInputObjectType
    ): Generator<TraverseOutput> {
      for (const field of Object.values(type.getFields())) {
        const fieldType = getNamedType(field.type);

        yield {
          source: "inputField" as const,
          children: [fieldType],
          fieldType,
          typeName: type.name,
          fieldName: field.name,
        };
      }
    },

    *traverseScalar(type: GraphQLScalarType): Generator<TraverseOutput> {
      // Nothing to yield
      void type;
    },

    *traverseEnum(type: GraphQLEnumType): Generator<TraverseOutput> {
      // Nothing to yield
      void type;
    },

    traverseNamedType(type: GraphQLNamedType): Generator<TraverseOutput> {
      if (isObjectType(type)) {
        return this.traverseObject(type);
      }

      if (isInterfaceType(type)) {
        return this.traverseInterface(type);
      }

      if (isUnionType(type)) {
        return this.traverseUnion(type);
      }

      if (isInputObjectType(type)) {
        return this.traverseInputObject(type);
      }

      if (isScalarType(type)) {
        return this.traverseScalar(type);
      }

      if (isEnumType(type)) {
        return this.traverseEnum(type);
      }

      throw new Error(`Unsupported type: ${type satisfies never}`);
    },
  };
}

export function traverseGraphQLType({
  schema,
  entrypoints,
  filter,
}: {
  schema: GraphQLSchema;
  entrypoints: GraphQLNamedType[];
  filter: (output: TraverseOutput) => boolean;
}): Generator<GraphQLNamedType> {
  const internal = createTypeTraverserInternal(schema);
  const visited = new Set<string>();

  function* traverse(types: GraphQLNamedType[]): Generator<GraphQLNamedType> {
    for (const type of types) {
      if (isIntrospectionType(type) || visited.has(type.name)) {
        continue;
      }

      yield (visited.add(type.name), type);

      for (const output of internal.traverseNamedType(type)) {
        if (!filter(output)) {
          continue;
        }

        yield* traverse(output.children);
      }
    }
  }

  return traverse(entrypoints);
}
