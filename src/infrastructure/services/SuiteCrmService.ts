import axios, { AxiosError, type AxiosInstance } from 'axios'
import * as CryptoJS from 'crypto-js'
import { objectToSnakeCase, snakeToCamel, camelToSnake } from '../utils/caseConverter'
import type {
  LoginArgs,
  LoginResponse,
  NameValue,
  EntryListResponse,
  SuiteCrmBaseModel,
  ObjectToSnakeCase,
  FlattenedModule,
  FlattenedSelectedModule
} from '../../domain/types/suitecrm'
import { isApiErrorResponse } from '../../domain/types/suitecrm'
import type { SuiteCrmModule, LinkQuery } from '../../domain/abstracts/SuiteCrmModule'

/**
 * Configuración de la API SuiteCRM
 */
export interface SuiteCrmConfig {
  baseURL: string
  username: string
  password: string
  applicationName: string
}

/**
 * Información del usuario autenticado
 */
export interface UserInfo {
  id: string
  username: string
  isAdmin: boolean
}

/**
 * Opciones para obtener lista de registros de SuiteCRM
 * Tipado estricto con valores por defecto explícitos
 * @template T Tipo del modelo principal
 * @template Relationships Mapa de relaciones disponibles
 * @template SelectedFields Campos seleccionados del modelo principal
 * @template LinkFields Campos seleccionados de las relaciones
 */
export interface GetEntryListOptions<
  T extends SuiteCrmBaseModel,
  Relationships,
  SelectedFields extends keyof T = keyof T,
  LinkFields extends LinkQuery<any, any> = never
> {
  readonly module: SuiteCrmModule<T, Relationships>
  readonly query: string
  readonly orderBy?: string
  readonly offset?: number
  readonly selectedFields?: SelectedFields[]
  /** Lista de relaciones a recuperar. Cada elemento define el link, el módulo destino y sus campos. */
  readonly linkNameToFieldsArray?: LinkFields[]
  readonly maxResults?: number
  readonly deleted?: boolean
}

/**
 * Opciones para crear o actualizar registros en SuiteCRM
 * Los valores deben estar en camelCase y se convertirán automáticamente a snake_case
 * @template T Tipo del objeto de valores (debe ser un objeto con propiedades en camelCase)
 */
export interface SetEntryOptions<T extends SuiteCrmBaseModel> {
  readonly module: SuiteCrmModule<T, any>
  readonly values: Partial<T>
}

/** Autentication Error */
export class SuiteCrmAuthenticationError extends Error {
  status: number
  constructor(message: string, status: number) {
    super(message)
    this.name = 'SuiteCrmAuthenticationError'
    this.status = status
  }
}

/**
 * Servicio base para consumir la API REST de SuiteCRM 4.1
 * Contiene los métodos básicos de la API sin lógica específica de aplicación
 */
export class SuiteCrmService {
  protected readonly api: AxiosInstance
  private readonly config: SuiteCrmConfig
  private userInfo: UserInfo | null = null
  private token: string | null = null

  constructor(config: SuiteCrmConfig) {
    this.config = config
    this.api = axios.create({
      baseURL: config.baseURL.endsWith('/') ? config.baseURL : `${config.baseURL}/`,
      timeout: 30000,
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
    })
  }

  /**
   * Genera el hash MD5 de una cadena (para la contraseña)
   */
  private md5Hash(text: string): string {
    return CryptoJS.MD5(text).toString()
  }

  /**
   * Envía una solicitud al endpoint REST de SuiteCRM
   * @template T Tipo de respuesta esperado
   * @param method Nombre del método de la API
   * @param args Argumentos del método
   * @returns Respuesta tipada de la API
   * @throws Error si la solicitud falla
   */
  private async request<T = unknown>(method: string, args: Record<string, unknown>): Promise<T> {
    // Usar ruta relativa, axios concatenará automáticamente con baseURL
    const apiPath = 'service/v4_1/rest.php'

    const postData = {
      method,
      input_type: 'JSON',
      response_type: 'JSON',
      rest_data: JSON.stringify(args),
    }

    try {
      const response = await this.api.post<T>(apiPath, new URLSearchParams(postData as Record<string, string>))
      return response.data
    } catch (error) {
      const axiosError = error as AxiosError
      const responseData = axiosError.response?.data ? JSON.stringify(axiosError.response.data) : ''
      throw new Error(`Error en solicitud a SuiteCRM: ${axiosError.message} ${responseData}`)
    }
  }

  /**
   * Obtiene y cachea el token de sesión
   * @returns Token de sesión de SuiteCRM
   * @throws Error si la autenticación falla
   */
  protected async getToken(): Promise<string> {
    if (this.token) {
      return this.token
    }

    const passwordHash = this.md5Hash(this.config.password.trim())

    const userAuth = {
      user_name: this.config.username.trim(),
      password: passwordHash,
    }

    const args: LoginArgs = {
      user_auth: userAuth,
      application_name: this.config.applicationName,
      name_value_list: {},
    }

    try {
      const response = await this.request<LoginResponse>('login', args as unknown as Record<string, unknown>)

      this.token = response.id || null
      this.userInfo = {
        username: response.name_value_list?.user_name.value as string || '',
        isAdmin: response.name_value_list?.user_is_admin.value as boolean || false,
        id: response.name_value_list?.user_id.value as string || '',
      }

      if (!this.token) {
        const errorMessage = response.description || 'Error desconocido al obtener token'
        throw new Error(`Error al obtener token de autenticación: ${errorMessage}`)
      }

      return this.token
    } catch (error) {
      this.clearToken();
      throw error
    }
  }

  /**
   * Ejecuta un método de SuiteCRM manejando autenticación y errores
   * @template T Tipo de respuesta esperado
   * @param method Nombre del método de la API
   * @param args Argumentos del método (sin session, se agrega automáticamente)
   * @returns Respuesta tipada de la API
   * @throws SuiteCrmAuthenticationError si la sesión es inválida
   * @throws Error si la llamada falla
   */
  private async call<T = unknown>(method: string, args: Record<string, unknown>): Promise<T> {
    if (!this.token) {
      await this.getToken()
    }

    const callArgs = { session: this.token, ...args }

    try {
      const result = await this.request<T>(method, callArgs)

      // Verificar si la respuesta es un error de API
      if (isApiErrorResponse(result)) {
        if (result.name === 'Invalid Session ID') {
          throw new SuiteCrmAuthenticationError('Invalid Session ID', 401)
        }
        throw new Error(`API Error: ${result.name} - ${result.description}`)
      }

      return result
    } catch (error) {
      if (error instanceof SuiteCrmAuthenticationError) {
        if (error.status === 401) {
          this.clearToken()
          await this.getToken()
          callArgs.session = this.token
          // Retry logic (recursive) - be careful with infinite loops, but with one retry it's fine
          // Re-implement retry manually to avoid recursion issues if possible, 
          // but here simple recursion is standard for auth retry.
          // Need to ensure we don't loop forever.
          // For now, we will retry once.
          try {
             const retryResult = await this.request<T>(method, callArgs);
             if (isApiErrorResponse(retryResult)) {
                throw new Error(`API Error: ${retryResult.name} - ${retryResult.description}`)
             }
             return retryResult;
          } catch (retryError) {
             throw retryError;
          }
        }
      }
      throw error
    }
  }

  /**
   * Obtiene registros de un módulo SuiteCRM de forma cruda (sin aplanar)
   * @template T Tipo del modelo principal
   * @template Relationships Mapa de relaciones disponibles
   * @param options Opciones de consulta tipadas
   * @returns Respuesta de la API con lista de registros cruda
   * @throws Error si la consulta falla
   */
  private async getEntryListRaw<
    T extends SuiteCrmBaseModel,
    Relationships,
    SelectedFields extends keyof T,
    LinkFields extends LinkQuery<any, any>
  >(
    options: GetEntryListOptions<T, Relationships, SelectedFields, LinkFields>
  ): Promise<EntryListResponse<ObjectToSnakeCase<T>>> {

    if (!this.userInfo) {
      await this.getToken()
    }

    let query = options.query

    const entryArgs = {
      module_name: options.module.name,
      query: query,
      order_by: options.orderBy ? camelToSnake(options.orderBy) : '',
      offset: options.offset ?? 0,
      select_fields: options.selectedFields?.map(f => camelToSnake(f as string)) ?? [],
      link_name_to_fields_array: options.linkNameToFieldsArray?.map(item => ({
        name: item.linkName,
        value: item.selectedFields.map((f: string) => camelToSnake(f))
      })) ?? [],
      max_results: options.maxResults ?? 20,
      deleted: (options.deleted === true ? 1 : 0) as 0 | 1,
    }

    const response = await this.call<EntryListResponse<ObjectToSnakeCase<T>>>('get_entry_list', entryArgs)
    return response
  }

  /**
   * Obtiene registros de un módulo SuiteCRM, aplanados y tipados correctamente.
   * El tipo de retorno se adapta dinámicamente a los campos seleccionados (Pick) y las relaciones solicitadas.
   * 
   * @template T Tipo del modelo principal
   * @template Relationships Mapa de relaciones disponibles
   * @template SelectedFields Campos seleccionados (inferido)
   * @template LinkFields Campos de relaciones seleccionados (inferido)
   * @param options Opciones de consulta tipadas
   * @returns Lista de registros aplanados y tipados estrictamente según lo solicitado
   * @throws Error si la consulta falla
   */
  public async getEntryList<
    T extends SuiteCrmBaseModel,
    Relationships = {},
    SelectedFields extends keyof T = keyof T,
    LinkFields extends LinkQuery<any, any> = never
  >(
    options: GetEntryListOptions<T, Relationships, SelectedFields, LinkFields>
  ): Promise<FlattenedSelectedModule<T, Relationships, SelectedFields, LinkFields>[]> {
    const rawResponse = await this.getEntryListRaw(options)
    return this.flattenEntryList<T, FlattenedSelectedModule<T, Relationships, SelectedFields, LinkFields>>(rawResponse)
  }

  /**
   * Crea o actualiza un registro en SuiteCRM
   * Convierte automáticamente los valores de camelCase a snake_case
   * @template T Tipo del objeto de valores (debe extender SuiteCrmBaseModel)
   * @param options Opciones con valores en camelCase (Partial)
   * @returns Promise que se resuelve cuando la operación se completa
   * @throws Error si la operación falla
   */
  public async setEntry<T extends SuiteCrmBaseModel>(
    options: SetEntryOptions<T>
  ): Promise<void> {
    // Convertir valores de camelCase a snake_case antes de enviar
    const snakeCaseValues = objectToSnakeCase(
      options.values as Record<string, unknown>
    )

    await this.call('set_entry', {
      session: this.token,
      module_name: options.module.name,
      name_value_list: this.parseNameValueList(snakeCaseValues),
    })
  }

  /**
   * Convierte el resultado de SuiteCRM en una lista de diccionarios simples
   * Hace flat de entry_list y relationship_list y convierte claves a camelCase
   * Genérico para funcionar con cualquier módulo de SuiteCRM
   * Permite un tipo de retorno R diferente a T para incluir campos de relaciones (ej: accounts_email1)
   * @template T Tipo del modelo base (debe extender SuiteCrmBaseModel)
   * @template R Tipo del resultado esperado (por defecto T), útil para incluir campos de relaciones aplanados
   * @param result Respuesta de get_entry_list de SuiteCRM
   * @returns Array de objetos parseados tipo R con claves en camelCase
   */
  private flattenEntryList<T extends SuiteCrmBaseModel = SuiteCrmBaseModel, R = T>(
    result: EntryListResponse<any>
  ): R[] {
    const entryList = result.entry_list || []
    const relationshipList = result.relationship_list || []
    const parsedEntries: R[] = []

    for (let i = 0; i < entryList.length; i++) {
      const entry = entryList[i]
      const nameValueList = entry.name_value_list || {}
      const flatEntry: Record<string, unknown> = {}

      // Hacer flat del entry_list y convertir claves a camelCase
      for (const [key, valueObj] of Object.entries(nameValueList)) {
        flatEntry[snakeToCamel(key)] = valueObj?.value
      }

      // Hacer flat del relationship_list
      if (relationshipList[i]) {
        const relationship = relationshipList[i]
        const linkList = relationship.link_list || []

        for (const link of linkList) {
          const linkName = link.name
          const records = link.records || []

          // Procesar cada registro del link
          for (const record of records) {
            const linkValue = record.link_value || {}

            // Concatenar linkName con cada campo del link_value y convertir a camelCase
            // Ejemplo: si linkName es 'contacts' y fieldName es 'email1' (snake), 
            // SuiteCRM retornaría contacts_email1. Convertimos a contactsEmail1.
            for (const [fieldName, fieldValue] of Object.entries(linkValue)) {
              const concatenatedKey = `${linkName}_${fieldName}`
              flatEntry[snakeToCamel(concatenatedKey)] = fieldValue?.value
            }
          }
        }
      }

      // El resultado ya está en camelCase
      parsedEntries.push(flatEntry as R)
    }

    return parsedEntries
  }

  /**
   * Convierte un objeto de valores a formato NameValue de SuiteCRM
   * @param nameValueList Objeto con valores a convertir
   * @returns Objeto en formato NameValue requerido por SuiteCRM
   */
  protected parseNameValueList(nameValueList: Record<string, unknown>): Record<string, NameValue> {
    const parsedNameValueList: Record<string, NameValue> = {}
    for (const [key, value] of Object.entries(nameValueList)) {
      parsedNameValueList[key] = { name: key, value: value }
    }
    return parsedNameValueList
  }

  /**
   * Obtiene la información del usuario autenticado
   */
  public getUserInfo(): UserInfo {
    if (!this.userInfo) {
      throw new Error('No hay información del usuario autenticado')
    }
    return this.userInfo
  }

  /**
   * Limpia el token de sesión (útil para forzar reautenticación)
   */
  public clearToken(): void {
    this.token = null
    this.userInfo = null
  }
}
