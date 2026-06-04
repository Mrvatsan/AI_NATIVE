import { z } from 'zod';
import { DataSchemaDef, DataSchema, Entity, Relation } from '../schemas/dataSchema';

export interface SchemaValidationResult {
  isValid: boolean;
  data?: DataSchema;
  errors: any[];
}

export const validateDataSchema = (data: unknown): SchemaValidationResult => {
  // Pre-sanitize: strip malformed data before Zod parse to handle LLM inconsistencies
  if (data && typeof data === 'object' && Array.isArray((data as any).entities)) {
    (data as any).entities = (data as any).entities.map((entity: any) => {
      if (!entity) return entity;
      // Strip empty/malformed FK entries (e.g. foreignKeys: [{}])
      if (Array.isArray(entity.foreignKeys)) {
        entity.foreignKeys = entity.foreignKeys.filter(
          (fk: any) => fk && typeof fk.columnName === 'string' && fk.columnName.length > 0
                    && typeof fk.referencedTable === 'string' && fk.referencedTable.length > 0
                    && typeof fk.referencedColumn === 'string' && fk.referencedColumn.length > 0
        );
      }
      // Coerce boolean field defaults for fields array
      if (Array.isArray(entity.fields)) {
        entity.fields = entity.fields.map((f: any) => ({
          ...f,
          nullable: typeof f.nullable === 'boolean' ? f.nullable : true,
          isRelation: typeof f.isRelation === 'boolean' ? f.isRelation : false,
          isPrimary: typeof f.isPrimary === 'boolean' ? f.isPrimary : false,
          isUnique: typeof f.isUnique === 'boolean' ? f.isUnique : false,
        }));
      }
      return entity;
    });
  }

  const result = DataSchemaDef.safeParse(data);
  
  if (!result.success) {
    return {
      isValid: false,
      errors: result.error.issues.map(iss => ({ type: 'STRUCTURE', ...iss }))
    };
  }

  const schema = result.data;
  const errors: any[] = [];
  const entityMap = new Map<string, Entity>();
  const tableToEntityMap = new Map<string, Entity>();
  
  // Build maps for quick lookups
  schema.entities.forEach(e => {
    // Strip malformed FK entries (empty objects with no columnName) before validation
    e.foreignKeys = e.foreignKeys.filter(
      (fk: any) => fk && typeof fk.columnName === 'string' && fk.columnName.length > 0
    );
    entityMap.set(e.name, e);
    tableToEntityMap.set(e.tableName, e);
  });

  // Pre-pass: auto-inject missing FK columns into fields so LLMs that
  // declare foreignKeys without duplicating the column in fields don't fail.
  for (const entity of schema.entities) {
    for (const fk of entity.foreignKeys) {
      const hasCol = entity.fields.some(f => f.name === fk.columnName);
      if (!hasCol) {
        entity.fields.push({
          name: fk.columnName,
          type: 'uuid',
          nullable: true,
          isRelation: false,
          isPrimary: false,
          isUnique: false
        });
      }
    }
  }

  // Pre-pass: auto-inject missing bidirectional back-references.
  // If A belongsTo B but B doesn't have a hasMany A, inject it.
  for (const entity of schema.entities) {
    for (const rel of entity.relations) {
      const target = entityMap.get(rel.targetEntity);
      if (!target) continue;
      const hasBackRef = target.relations.some(r => r.targetEntity === entity.name);
      if (!hasBackRef) {
        let inverseType: 'hasMany' | 'hasOne' | 'belongsTo' | 'belongsToMany' = 'hasMany';
        if (rel.type === 'hasMany') inverseType = 'belongsTo';
        else if (rel.type === 'hasOne') inverseType = 'belongsTo';
        else if (rel.type === 'belongsTo') inverseType = 'hasMany';
        else if (rel.type === 'belongsToMany') inverseType = 'belongsToMany';
        target.relations.push({ type: inverseType, targetEntity: entity.name });
      }
    }
  }

  // Pre-pass: auto-synthesize missing foreignKeys for belongsTo relations.
  // If entity A belongsTo B but has no FK referencing B's table, generate one.
  for (const entity of schema.entities) {
    for (const rel of entity.relations) {
      if (rel.type !== 'belongsTo') continue;
      const target = entityMap.get(rel.targetEntity);
      if (!target) continue;
      const hasFK = entity.foreignKeys.some(fk => fk.referencedTable === target.tableName);
      if (!hasFK) {
        // Synthesize column name: e.g. SalesRep → salesRepId
        const colName = rel.targetEntity.charAt(0).toLowerCase() + rel.targetEntity.slice(1) + 'Id';
        // Inject the FK column into fields if not already there
        if (!entity.fields.some(f => f.name === colName)) {
          entity.fields.push({
            name: colName, type: 'uuid', nullable: true,
            isRelation: false, isPrimary: false, isUnique: false
          });
        }
        entity.foreignKeys.push({
          columnName: colName,
          referencedTable: target.tableName,
          referencedColumn: 'id',
          onDelete: 'CASCADE'
        });
      }
    }
  }

  // Entity-level rules
  for (const entity of schema.entities) {
    // 1. Mandatory tenantId
    const hasTenantId = entity.fields.some(f => f.name === 'tenantId');
    if (!hasTenantId) {
      errors.push({ type: 'MISSING_FIELD', entity: entity.name, message: 'Missing mandatory tenantId field' });
    }

    // 2. Mandatory id (uuid, primary, non-nullable)
    const idField = entity.fields.find(f => f.name === 'id');
    if (!idField) {
      errors.push({ type: 'MISSING_FIELD', entity: entity.name, message: 'Missing mandatory id field' });
    } else {
      if (idField.type !== 'uuid' || !idField.isPrimary || idField.nullable) {
        errors.push({ type: 'INVALID_FIELD', entity: entity.name, message: 'id field must be uuid, primary, and non-nullable' });
      }
    }

    // 3. Table name rules (snake_case)
    if (!/^[a-z_]+$/.test(entity.tableName)) {
      errors.push({ type: 'INVALID_TABLE_NAME', entity: entity.name, message: 'Table name must be snake_case' });
    }

    // 4. Relation Rules
    for (const rel of entity.relations) {
      const target = entityMap.get(rel.targetEntity);
      if (!target) {
        errors.push({ type: 'BROKEN_RELATION', entity: entity.name, message: `Relation target ${rel.targetEntity} does not exist` });
      } else {
        // Bidirectional Consistency
        const backRef = target.relations.find(r => r.targetEntity === entity.name);
        if (!backRef) {
          errors.push({ type: 'BROKEN_RELATION_SYMMETRY', entity: entity.name, target: target.name, message: `Missing bidirectional relation from ${target.name} to ${entity.name}` });
        }

        // BelongsTo implies a Foreign Key must exist
        if (rel.type === 'belongsTo') {
          const hasFK = entity.foreignKeys.some(fk => fk.referencedTable === target.tableName);
          if (!hasFK) {
            errors.push({
              type: 'MISSING_FOREIGN_KEY',
              entity: entity.name,
              target: target.name,
              message: `Relation belongsTo ${target.name} requires a foreign key referencing table ${target.tableName}`
            });
          }
        }
      }
    }

    // 5. Foreign Key Rules
    for (const fk of entity.foreignKeys) {
      const refEntity = tableToEntityMap.get(fk.referencedTable);
      if (!refEntity) {
        errors.push({ type: 'INVALID_FOREIGN_KEY', entity: entity.name, message: `Foreign key references non-existent table ${fk.referencedTable}` });
      } else {
        // Referenced column must exist in target entity (typically 'id')
        const refField = refEntity.fields.find(f => f.name === fk.referencedColumn);
        if (!refField) {
          errors.push({ type: 'INVALID_FOREIGN_KEY', entity: entity.name, message: `Foreign key references non-existent column ${fk.referencedColumn} on table ${fk.referencedTable}` });
        }
      }
      
      // Ensure column exists in current entity
      const localCol = entity.fields.find(f => f.name === fk.columnName);
      if (!localCol) {
        errors.push({ type: 'INVALID_FOREIGN_KEY', entity: entity.name, message: `Foreign key column ${fk.columnName} does not exist in entity ${entity.name}` });
      }

      // Valid onDelete
      if (!['CASCADE', 'SET_NULL', 'RESTRICT', 'NO_ACTION'].includes(fk.onDelete)) {
        errors.push({ type: 'INVALID_ON_DELETE', entity: entity.name, message: `Invalid onDelete action ${fk.onDelete}` });
      }
    }
  }

  return {
    isValid: errors.length === 0,
    data: schema,
    errors
  };
};

