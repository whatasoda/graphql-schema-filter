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
  type: GraphQLOutputType;
  parent: GraphQLObjectType | GraphQLInterfaceType;
  fieldName: string;
}

interface TraversalOutput__InputField extends TraversalOutputBase {
  source: "inputField";
  type: GraphQLInputType;
  parent: GraphQLInputObjectType;
  fieldName: string;
}

interface TraversalOutput__Implements extends TraversalOutputBase {
  source: "implements";
  type: GraphQLInterfaceType;
}

interface TraversalOutput__UnionMember extends TraversalOutputBase {
  source: "unionMember";
  type: GraphQLObjectType;
}

interface TraversalOutput__InterfaceImplementation extends TraversalOutputBase {
  source: "interfaceImplementation";
  type: GraphQLObjectType;
  interface: GraphQLInterfaceType;
}

type TraversalOutput =
  | TraversalOutput__OutputField
  | TraversalOutput__InputField
  | TraversalOutput__Implements
  | TraversalOutput__UnionMember
  | TraversalOutput__InterfaceImplementation;

export function createTypeTraverserInternal(schema: GraphQLSchema) {
  return {
    *traverseObject(type: GraphQLObjectType): Generator<TraversalOutput> {
      for (const field of Object.values(type.getFields())) {
        const nextType = getNamedType(field.type);

        yield {
          source: "outputField" as const,
          type: nextType,
          children: [
            nextType,
            ...field.args.map((arg) => getNamedType(arg.type)),
          ],
          parent: type,
          fieldName: field.name,
        };
      }

      for (const interface_ of type.getInterfaces()) {
        yield {
          source: "implements" as const,
          type: interface_,
          children: [interface_],
        };
      }
    },

    *traverseInterface(type: GraphQLInterfaceType): Generator<TraversalOutput> {
      for (const field of Object.values(type.getFields())) {
        const nextType = getNamedType(field.type);

        yield {
          source: "outputField" as const,
          type: nextType,
          children: [
            nextType,
            ...field.args.map((arg) => getNamedType(arg.type)),
          ],
          parent: type,
          fieldName: field.name,
        };
      }

      // Interface の実装型を yield
      const implementations = schema.getPossibleTypes(type);
      for (const implType of implementations) {
        yield {
          source: "interfaceImplementation" as const,
          type: implType,
          children: [implType],
          interface: type,
        };
      }
    },

    *traverseUnion(type: GraphQLUnionType): Generator<TraversalOutput> {
      for (const member of schema.getPossibleTypes(type)) {
        yield {
          source: "unionMember" as const,
          type: member,
          children: [member],
        };
      }
    },

    *traverseInputObject(
      type: GraphQLInputObjectType
    ): Generator<TraversalOutput> {
      for (const field of Object.values(type.getFields())) {
        const nextType = getNamedType(field.type);

        yield {
          source: "inputField" as const,
          type: nextType,
          children: [nextType],
          parent: type,
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

export function traverseGraphQLNamedType(
  schema: GraphQLSchema,
  entrypoints: GraphQLNamedType[],
  filter: (output: TraversalOutput) => boolean
): Generator<GraphQLNamedType> {
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
