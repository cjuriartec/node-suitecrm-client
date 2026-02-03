/**
 * Tipos base de SuiteCRM
 * Estos tipos representan la estructura base de SuiteCRM sin dependencias de implementaciones específicas
 * Incluye tipos de la API REST v4.1 y tipos genéricos de módulos
 */

/**
 * Nombre de módulo de SuiteCRM (genérico, sin dependencias de implementaciones específicas)
 */
export type SuiteCrmModuleName = string

/**
 * Modelo base de SuiteCRM con campos comunes
 * Atributos en camelCase para uso en la aplicación (la librería convierte a snake_case)
 */
export interface SuiteCrmBaseModel {
  id?: string
  dateEntered?: string
  dateModified?: string
  modifiedUserId?: string
  createdBy?: string
  deleted?: boolean
}

/**
 * Estructura NameValue utilizada por SuiteCRM para representar campos
 */
export interface NameValue {
  name: string
  value: unknown
}

/**
 * Lista de links en relaciones de SuiteCRM
 */
export interface LinkList {
  name: string
  records?: LinkRecord[]
}

/**
 * Registro de link en relaciones de SuiteCRM
 */
export interface LinkRecord {
  link_value?: Record<string, NameValue>
}

/**
 * Respuesta de get_entry_list de SuiteCRM
 */
export interface EntryListResponse<T = unknown> {
  entry_list?: Array<{
    name_value_list?: Record<string, NameValue>
  }>
  relationship_list?: Array<{
    link_list?: LinkList[]
  }>
}

/**
 * Tipos estrictos para los argumentos de get_entry_list
 */
export interface GetEntryListArgs {
  session: string
  module_name: SuiteCrmModuleName
  query: string
  order_by: string
  offset: number
  select_fields: string[]
  link_name_to_fields_array: Array<{
    name: string
    value: string[]
  }>
  max_results: number
  deleted: 0 | 1
}

/**
 * Tipos estrictos para los argumentos de set_entry
 */
export interface SetEntryArgs {
  session: string
  module_name: SuiteCrmModuleName
  name_value_list: Record<string, NameValue>
}

/**
 * Tipos estrictos para los argumentos de login
 */
export interface LoginArgs {
  user_auth: {
    user_name: string
    password: string
  }
  application_name: string
  name_value_list: Record<string, unknown>
}

/**
 * Respuesta estricta de login
 */
export interface LoginResponse {
  id: string
  module_name: string
  name_value_list: {
    user_id: { value: string }
    user_name: { value: string }
    user_is_admin: { value: boolean }
  }
  description?: string
}

/**
 * Verifica si una respuesta es un error de API
 */
export function isApiErrorResponse(response: unknown): response is { name: string, description: string } {
  return (
    typeof response === 'object' &&
    response !== null &&
    'name' in response &&
    'description' in response &&
    typeof (response as any).name === 'string' &&
    (response as any).name !== 'Success' // Ajustar según respuestas de éxito reales si es necesario
  )
}

// ==========================================
// UTILITY TYPES FOR FLATTENING
// ==========================================

/**
 * Convierte snake_case a CamelCase a nivel de tipos.
 * Ejemplo: 'fitac_fitac_proy' -> 'fitacFitacProy'
 */
export type SnakeToCamelCase<S extends string> = S extends `${infer T}_${infer U}`
  ? `${T}${Capitalize<SnakeToCamelCase<U>>}`
  : S

/**
 * Convierte CamelCase a snake_case a nivel de tipos.
 * Ejemplo: 'fitacFitacProy' -> 'fitac_fitac_proy'
 */
export type CamelToSnakeCase<S extends string> = S extends `${infer T}${infer U}`
  ? `${T extends Capitalize<T> ? "_" : ""}${Lowercase<T>}${CamelToSnakeCase<U>}`
  : S

/**
 * Convierte las claves de un objeto de CamelCase a snake_case.
 */
export type ObjectToSnakeCase<T> = {
  [K in keyof T as CamelToSnakeCase<string & K>]: T[K]
}

/**
 * Convierte una unión de tipos a una intersección.
 * Ejemplo: A | B -> A & B
 */
type UnionToIntersection<U> = 
  (U extends any ? (k: U) => void : never) extends ((k: infer I) => void) ? I : never

/**
 * Genera los campos aplanados para una relación específica, filtrando por los campos seleccionados.
 * Prefijo: CamelCase del nombre del link.
 * Sufijo: CamelCase del nombre del campo (con primera letra mayúscula).
 */
export type FlattenedRelationship<
  LinkName extends string, 
  RelatedModel, 
  SelectedFields extends keyof RelatedModel = keyof RelatedModel
> = {
  [P in SelectedFields as `${SnakeToCamelCase<LinkName>}${Capitalize<string & P>}`]?: RelatedModel[P]
}

/**
 * Tipo utilidad que combina el modelo base con todas sus relaciones aplanadas.
 * Útil para `flattenEntryList`.
 * 
 * @template Base Modelo principal
 * @template Relationships Mapa de relaciones { linkName: RelatedModel }
 */
export type FlattenedModule<Base, Relationships> = Base & UnionToIntersection<{
  [K in keyof Relationships]: FlattenedRelationship<K & string, Relationships[K]>
}[keyof Relationships]>

/**
 * Tipo que representa un módulo aplanado con selección de campos.
 * Filtra el modelo base por `SelectedFields` y las relaciones por `LinkFields`.
 * 
 * @template Base Modelo principal
 * @template Relationships Mapa de relaciones { linkName: RelatedModel }
 * @template SelectedFields Campos seleccionados del modelo principal (unión de strings)
 * @template LinkFields Definiciones de campos seleccionados por relación (tipo LinkQuery)
 */
export type FlattenedSelectedModule<
  Base,
  Relationships,
  SelectedFields extends keyof Base,
  LinkFields extends { linkName: string, selectedFields: any }
> = Pick<Base, SelectedFields> & UnionToIntersection<
  LinkFields extends { linkName: infer LN, selectedFields: infer SF }
    ? LN extends keyof Relationships
      ? FlattenedRelationship<LN & string, Relationships[LN], SF extends Array<infer F> ? F & keyof Relationships[LN] : never>
      : never
    : never
>
