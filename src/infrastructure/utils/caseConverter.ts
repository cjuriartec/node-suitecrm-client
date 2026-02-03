/**
 * Utilidades para conversión entre camelCase y snake_case
 * SuiteCRM usa snake_case, pero nuestro código usa camelCase
 */

/**
 * Convierte una cadena de camelCase a snake_case
 * @example camelToSnake('assignedUserId') => 'assigned_user_id'
 * @example camelToSnake('nroDocIdentificacion') => 'nro_doc_identificacion'
 */
export function camelToSnake(str: string): string {
  return str.replace(/[A-Z]/g, (letter) => `_${letter.toLowerCase()}`)
}

/**
 * Convierte una cadena de snake_case a camelCase
 * @example snakeToCamel('assigned_user_id') => 'assignedUserId'
 * @example snakeToCamel('nro_doc_identificacion') => 'nroDocIdentificacion'
 */
export function snakeToCamel(str: string): string {
  return str.replace(/_([a-z])/g, (_, letter) => letter.toUpperCase())
}

/**
 * Convierte un objeto de camelCase a snake_case recursivamente
 * @param obj Objeto en camelCase
 * @returns Objeto en snake_case
 */
export function objectToSnakeCase<T extends Record<string, unknown>>(
  obj: T
): Record<string, unknown> {
  const result: Record<string, unknown> = {}

  for (const [key, value] of Object.entries(obj)) {
    const snakeKey = camelToSnake(key)

    if (value === null || value === undefined) {
      result[snakeKey] = value
    } else if (Array.isArray(value)) {
      result[snakeKey] = value.map((item) =>
        typeof item === 'object' && item !== null
          ? objectToSnakeCase(item as Record<string, unknown>)
          : item
      )
    } else if (typeof value === 'object' && value.constructor === Object) {
      result[snakeKey] = objectToSnakeCase(value as Record<string, unknown>)
    } else {
      result[snakeKey] = value
    }
  }

  return result
}

/**
 * Convierte un objeto de snake_case a camelCase recursivamente
 * @param obj Objeto en snake_case
 * @returns Objeto en camelCase
 */
export function objectToCamelCase<T extends Record<string, unknown>>(
  obj: T
): Record<string, unknown> {
  const result: Record<string, unknown> = {}

  for (const [key, value] of Object.entries(obj)) {
    const camelKey = snakeToCamel(key)

    if (value === null || value === undefined) {
      result[camelKey] = value
    } else if (Array.isArray(value)) {
      result[camelKey] = value.map((item) =>
        typeof item === 'object' && item !== null
          ? objectToCamelCase(item as Record<string, unknown>)
          : item
      )
    } else if (typeof value === 'object' && value.constructor === Object) {
      result[camelKey] = objectToCamelCase(value as Record<string, unknown>)
    } else {
      result[camelKey] = value
    }
  }

  return result
}
