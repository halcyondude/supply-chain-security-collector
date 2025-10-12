import { tableFromArrays } from 'apache-arrow';
import * as arrow from 'apache-arrow';

export function transform(responses: any[], schemaMap: any): Map<string, arrow.Table> {
    const rows = new Map<string, any[]>();
    
    for (const response of responses) {
        walk(response, null, null, schemaMap, rows);
    }

    const tables = new Map<string, arrow.Table>();
    for (const [tableName, tableRows] of rows.entries()) {
        const columns: { [key: string]: any[] } = {};
        const entity = schemaMap.entities[tableName];
        for (const fieldName in entity.fields) {
            if (entity.fields[fieldName].isScalar) {
                columns[fieldName] = tableRows.map(row => row[fieldName]);
            }
        }
        columns['parentId'] = tableRows.map(row => row.parentId);
        columns['parentType'] = tableRows.map(row => row.parentType);

        const table = tableFromArrays(columns);
        tables.set(tableName, table);
        console.log(`✅ Created table ${tableName} with ${tableRows.length} rows`);
    }

    return tables;
}

function walk(obj: any, parentId: string | null, parentType: string | null, schemaMap: any, rows: Map<string, any[]>) {
    if (!obj || typeof obj !== 'object') {
        return;
    }

    const typeName = obj.__typename;
    
    if (!typeName || !schemaMap.entities[typeName]) {
        // Try to recurse into objects without typename
        for (const key in obj) {
            const value = obj[key];
            if (value && typeof value === 'object') {
                if (Array.isArray(value)) {
                    for (const item of value) {
                        walk(item, parentId, parentType, schemaMap, rows);
                    }
                } else {
                    walk(value, parentId, parentType, schemaMap, rows);
                }
            }
        }
        return;
    }

    const entity = schemaMap.entities[typeName];
    if (!rows.has(typeName)) {
        rows.set(typeName, []);
    }

    const row: { [key: string]: any } = {};
    const id = generateId(obj);

    for (const fieldName in entity.fields) {
        const field = entity.fields[fieldName];
        if (field.isScalar) {
            row[fieldName] = obj[fieldName] !== undefined ? obj[fieldName] : null;
        }
    }

    row['parentId'] = parentId;
    row['parentType'] = parentType;

    rows.get(typeName)!.push(row);

    for (const fieldName in entity.fields) {
        const field = entity.fields[fieldName];
        if (!field.isScalar) {
            const nestedObj = obj[fieldName];
            if (nestedObj) {
                if (Array.isArray(nestedObj)) {
                    for (const item of nestedObj) {
                        walk(item, id, typeName, schemaMap, rows);
                    }
                } else {
                    walk(nestedObj, id, typeName, schemaMap, rows);
                }
            }
        }
    }
}

function generateId(obj: any): string {
    // A simple way to generate a unique ID for an object. In a real scenario, this might be more robust.
    return obj.id || `${obj.__typename}_${Math.random().toString(36).substr(2, 9)}`;
}