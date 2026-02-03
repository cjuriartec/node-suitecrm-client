import { SuiteCrmBaseModel, SnakeToCamelCase } from '../types/suitecrm'
import { snakeToCamel } from '../../infrastructure/utils/caseConverter'

/**
 * Definición de una relación a recuperar
 * @template K Nombre del link (clave en el mapa de relaciones)
 * @template R Tipo del módulo relacionado
 */
export interface LinkQuery<K extends string, R extends SuiteCrmBaseModel, F extends keyof R & string = keyof R & string> {
  /** Nombre de la relación (link) en el módulo principal (ej: 'contacts', 'accounts') */
  readonly linkName: K
  /** Módulo relacionado (instancia de SuiteCrmModule) */
  readonly module: SuiteCrmModule<R, any>
  /** Lista de campos del módulo relacionado a recuperar (ej: ['email1', 'firstName']) */
  readonly selectedFields: F[]
}

/**
 * Clase que representa una relación definida.
 * Permite seleccionar campos de forma tipada sin repetir el linkName.
 * @template K Nombre del link
 * @template T Tipo del modelo relacionado
 */
export class SuiteCrmRelationship<K extends string, T extends SuiteCrmBaseModel> {
  constructor(
    public readonly linkName: K,
    public readonly relatedModule: SuiteCrmModule<T, any>
  ) {}

  /**
   * Genera la consulta para esta relación seleccionando los campos deseados.
   * @param selectedFields Campos a seleccionar del módulo relacionado
   */
  public select<F extends keyof T & string>(selectedFields: F[]): LinkQuery<K, T, F> {
    return {
      linkName: this.linkName,
      module: this.relatedModule,
      selectedFields
    }
  }
}

/**
 * Clase base para definir un módulo de SuiteCRM.
 * Encapsula el nombre del módulo, el tipo de sus atributos y sus relaciones disponibles.
 * Permite definir modelos y relaciones de forma estricta, similar a un ORM.
 * 
 * @template T Tipo de los atributos del módulo (debe extender SuiteCrmBaseModel)
 * @template Relationships Mapa de relaciones disponibles (linkName -> Tipo del modelo relacionado)
 */
export class SuiteCrmModule<
  T extends SuiteCrmBaseModel,
  Relationships = {}
> {
  /**
   * Colección de relaciones definidas listas para usar en consultas.
   * Permite acceder a las relaciones como propiedades en camelCase: modulo.links.nombreLink
   */
  public readonly links: {
    [K in keyof Relationships as SnakeToCamelCase<K & string>]: SuiteCrmRelationship<K & string, Relationships[K] extends SuiteCrmBaseModel ? Relationships[K] : never>
  }

  /**
   * Crea una nueva instancia de definición de módulo.
   * @param name Nombre del módulo en SuiteCRM (ej: 'Contacts', 'Accounts')
   * @param existingLinks (Interno) Links existentes al usar el patrón builder
   */
  constructor(
    public readonly name: string,
    existingLinks: Record<string, SuiteCrmRelationship<any, any>> = {}
  ) {
    this.links = existingLinks as any
  }

  /**
   * Agrega una relación al módulo (Patrón Builder).
   * Retorna una NUEVA instancia del módulo con el tipo de la relación inferido automáticamente.
   * 
   * @param linkName Nombre del link en SuiteCRM
   * @param relatedModule Módulo relacionado
   * @returns Nueva instancia de SuiteCrmModule con la relación agregada al tipado
   */
  public withLink<K extends string, R extends SuiteCrmBaseModel>(
    linkName: K,
    relatedModule: SuiteCrmModule<R, any>
  ): SuiteCrmModule<T, Relationships & { [P in K]: R }> {
    const newRelationship = new SuiteCrmRelationship(linkName, relatedModule)
    
    // Convertimos la clave a camelCase para facilitar el acceso en .links
    const camelKey = snakeToCamel(linkName)
    
    const newLinks = {
      ...this.links,
      [camelKey]: newRelationship
    }

    return new SuiteCrmModule(this.name, newLinks) as any
  }

  /**
   * Define una relación para usarla posteriormente en consultas.
   * (Método legacy/manual, preferir usar withLink para inferencia automática)
   */
  public defineRelationship<K extends keyof Relationships & string>(
    linkName: K,
    relatedModule: SuiteCrmModule<Relationships[K] extends SuiteCrmBaseModel ? Relationships[K] : never, any>
  ): SuiteCrmRelationship<K, Relationships[K] extends SuiteCrmBaseModel ? Relationships[K] : never> {
    return new SuiteCrmRelationship(linkName, relatedModule)
  }
}
