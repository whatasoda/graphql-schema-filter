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

interface TraversalOutputBase {
  children: GraphQLNamedType[];
}

interface TraversalOutput__OutputField extends TraversalOutputBase {
  source: "outputField";
  fieldType: GraphQLOutputType;
  typeName: string;
  fieldName: string;
}

interface TraversalOutput__InterfaceField extends TraversalOutputBase {
  source: "interfaceField";
  fieldType: GraphQLOutputType;
  typeName: string;
  fieldName: string;
}

interface TraversalOutput__InputField extends TraversalOutputBase {
  source: "inputField";
  fieldType: GraphQLInputType;
  typeName: string;
  fieldName: string;
}

interface TraversalOutput__ImplementedInterface extends TraversalOutputBase {
  source: "implementedInterface";
  interfaceType: GraphQLInterfaceType;
  typeName: string;
}

interface TraversalOutput__UnionMember extends TraversalOutputBase {
  source: "unionMember";
  memberType: GraphQLObjectType;
  unionName: string;
}

type TraversalOutput =
  | TraversalOutput__OutputField
  | TraversalOutput__InterfaceField
  | TraversalOutput__InputField
  | TraversalOutput__ImplementedInterface
  | TraversalOutput__UnionMember;

export function createTypeTraverserInternal(schema: GraphQLSchema) {
  return {
    *traverseObject(type: GraphQLObjectType): Generator<TraversalOutput> {
      for (const field of Object.values(type.getFields())) {
        const fieldType = getNamedType(field.type);

        yield {
          source: "outputField" as const,
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
          source: "implementedInterface" as const,
          interfaceType: interface_,
          children: [interface_],
          typeName: type.name,
        };
      }
    },

    *traverseInterface(type: GraphQLInterfaceType): Generator<TraversalOutput> {
      for (const field of Object.values(type.getFields())) {
        const fieldType = getNamedType(field.type);

        yield {
          source: "interfaceField" as const,
          fieldType,
          children: [
            fieldType,
            ...field.args.map((arg) => getNamedType(arg.type)),
          ],
          typeName: type.name,
          fieldName: field.name,
        };
      }
    },

    *traverseUnion(type: GraphQLUnionType): Generator<TraversalOutput> {
      for (const memberType of schema.getPossibleTypes(type)) {
        yield {
          source: "unionMember" as const,
          memberType: memberType,
          children: [memberType],
          unionName: type.name,
        };
      }
    },

    *traverseInputObject(
      type: GraphQLInputObjectType
    ): Generator<TraversalOutput> {
      for (const field of Object.values(type.getFields())) {
        const fieldType = getNamedType(field.type);

        yield {
          source: "inputField" as const,
          fieldType,
          children: [fieldType],
          typeName: type.name,
          fieldName: field.name,
        };
      }
    },

    *traverseScalar(type: GraphQLScalarType): Generator<TraversalOutput> {
      // Nothing to yield
      void type;
    },

    *traverseEnum(type: GraphQLEnumType): Generator<TraversalOutput> {
      // Nothing to yield
      void type;
    },

    traverseNamedType(type: GraphQLNamedType): Generator<TraversalOutput> {
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
  filter: (output: TraversalOutput) => boolean;
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
