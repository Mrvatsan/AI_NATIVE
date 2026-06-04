import { z } from 'zod';

export const fieldTypeEnum = z.enum([
  'string',
  'number',
  'boolean',
  'date',
  'datetime',
  'uuid',
  'text'
]);

export const relationTypeEnum = z.enum([
  'hasOne',
  'hasMany',
  'belongsTo',
  'belongsToMany'
]);

export const onDeleteEnum = z.enum([
  'CASCADE',
  'SET_NULL',
  'RESTRICT',
  'NO_ACTION'
]);

export const FieldSchema = z.object({
  name: z.string(),
  type: fieldTypeEnum,
  nullable: z.boolean().optional().default(true),
  isRelation: z.boolean().optional().default(false),
  isPrimary: z.boolean().optional().default(false),
  isUnique: z.boolean().optional().default(false)
});

export const RelationSchema = z.object({
  type: relationTypeEnum,
  targetEntity: z.string()
});

export const ForeignKeySchema = z.object({
  columnName: z.string(),
  referencedTable: z.string(),
  referencedColumn: z.string(),
  onDelete: onDeleteEnum
});

export const EntitySchema = z.object({
  name: z.string(),
  tableName: z.string(),
  fields: z.array(FieldSchema),
  relations: z.array(RelationSchema),
  foreignKeys: z.array(ForeignKeySchema)
});

export const DataSchemaDef = z.object({
  entities: z.array(EntitySchema)
});

export type Field = z.infer<typeof FieldSchema>;
export type Relation = z.infer<typeof RelationSchema>;
export type ForeignKey = z.infer<typeof ForeignKeySchema>;
export type Entity = z.infer<typeof EntitySchema>;
export type DataSchema = z.infer<typeof DataSchemaDef>;

