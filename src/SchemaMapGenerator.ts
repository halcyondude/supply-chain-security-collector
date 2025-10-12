
import * as fs from 'fs';
import * as path from 'path';
import { loadSchemaSync } from '@graphql-tools/load';
import { GraphQLFileLoader } from '@graphql-tools/graphql-file-loader';
import { GraphQLSchema, isObjectType, getNamedType, isScalarType, isListType, isNonNullType } from 'graphql';

/**
 * Generates a JSON map of the GraphQL schema, extracting object types, fields, and their relationships.
 * @param schemaPath Path to the GraphQL schema file.
 * @param outputPath Path to write the schema-map.json file.
 */
export function generateSchemaMap(schemaPath: string, outputPath: string) {
    const schema = loadSchemaSync(schemaPath, {
        loaders: [new GraphQLFileLoader()],
        assumeValidSDL: true
    });

    const schemaMap = introspectSchema(schema);

    fs.writeFileSync(outputPath, JSON.stringify(schemaMap, null, 2));
    console.log(`✅ Schema map generated at ${outputPath}`);
}

function introspectSchema(schema: GraphQLSchema) {
    const typeMap = schema.getTypeMap();
    const entities: { [key: string]: any } = {};

    for (const typeName in typeMap) {
        const type = typeMap[typeName];
        if (isObjectType(type) && !typeName.startsWith('__')) {
            entities[typeName] = {
                name: type.name,
                description: type.description || '',
                fields: {},
            };

            const fields = type.getFields();
            for (const fieldName in fields) {
                const field = fields[fieldName];
                const fieldType = getNamedType(field.type);

                let typeName: string;
                let isList = false;

                if (isListType(field.type) || (isNonNullType(field.type) && isListType(field.type.ofType))) {
                    isList = true;
                    const unwrappedType = isNonNullType(field.type) ? field.type.ofType : field.type;
                    typeName = getNamedType(unwrappedType).name;
                } else {
                    typeName = fieldType.name;
                }

                entities[type.name].fields[fieldName] = {
                    name: field.name,
                    description: field.description || '',
                    type: typeName,
                    isScalar: isScalarType(fieldType),
                    isList: isList,
                };
            }
        }
    }
    return { entities };
}

// Example usage when run directly:
if (require.main === module) {
    const schemaPath = path.join(__dirname, '../schema/github-v15.26.0.graphql');
    const outputPath = path.join(__dirname, '../docs/schema-map.json');
    generateSchemaMap(schemaPath, outputPath);
}
