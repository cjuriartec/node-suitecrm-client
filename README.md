# SuiteCRM Client for Node.js

Cliente ligero y fuertemente tipado para la API REST v4.1 de SuiteCRM, diseñado con TypeScript y Clean Architecture.

## Características

- 🚀 **Tipado Estricto (Extreme Strict Typing)**: Generación automática de tipos para resultados y relaciones. Sin `any` ni `[key: string]`.
- 🏗️ **Estilo ORM / Builder**: Definición de módulos y relaciones encadenables (`.withLink`) para una configuración limpia.
- 🔄 **Conversión Automática de Casos**: `camelCase` en código <-> `snake_case` en API de forma transparente.
- 📦 **Resultados Aplanados Automáticos**: `getEntryList` retorna objetos limpios y tipados, eliminando la estructura compleja `name_value_list` de SuiteCRM.
- 🔐 **Gestión de Sesiones**: Autenticación y re-conexión automática.

## Instalación

```bash
npm install suitecrm-client
```

## Uso Avanzado (Recomendado)

Esta librería utiliza un patrón de definición de módulos para garantizar el tipado estricto en todo momento.

### 1. Definir Interfaces de Atributos

Define las propiedades que esperas de tus módulos.

```typescript
import { SuiteCrmBaseModel } from 'suitecrm-client';

// Módulo Relacionado (Ej. Proyectos)
interface ProyectoAttributes extends SuiteCrmBaseModel {
  name?: string;
  description?: string;
  assignedUserId?: string;
}

// Módulo Principal (Ej. FITAC)
interface FitacAttributes extends SuiteCrmBaseModel {
  name?: string;
  statusId?: string;
  documentName?: string;
}
```

### 2. Definir Módulos y Relaciones

Usa `SuiteCrmModule` y el método `.withLink()` para configurar tus módulos y sus relaciones en un solo paso.

```typescript
import { SuiteCrmModule } from 'suitecrm-client';

// Definir módulo secundario
const ModuloProyectos = new SuiteCrmModule<ProyectoAttributes>('proy_Proyectos');

// Definir módulo principal y sus relaciones
const ModuloFitac = new SuiteCrmModule<FitacAttributes>('Fitac_fitac')
  .withLink('fitac_fitac_proy_proyectos', ModuloProyectos);
```

### 3. Consultar Datos (Strict Typing)

El método `getEntryList` infiere automáticamente los tipos de retorno basándose en los campos seleccionados (`selectedFields`) y las relaciones solicitadas (`linkNameToFieldsArray`).

```typescript
import { SuiteCrmService } from 'suitecrm-client';

const service = new SuiteCrmService({
  baseURL: 'https://tu-suitecrm.com',
  username: 'usuario',
  password: 'password',
  applicationName: 'mi-app'
});

async function main() {
  // La respuesta tendrá Tipado Estricto: solo los campos solicitados existirán en el tipo.
  const resultados = await service.getEntryList({
    module: ModuloFitac,
    query: "",
    maxResults: 10,
    
    // Solo estos campos estarán presentes en el objeto 'item'
    selectedFields: ['id', 'name', 'documentName'],
    
    // Consultar relaciones definidas
    linkNameToFieldsArray: [
      // Acceso type-safe a la relación en camelCase
      ModuloFitac.links.fitacFitacProyProyectos.select(['name', 'description'])
    ]
  });

  resultados.forEach(item => {
    console.log(item.name); // OK
    console.log(item.documentName); // OK
    
    // Acceso a relación aplanada (automáticamente fusionada en el objeto principal)
    // Nota: El nombre de la propiedad de relación se basa en el linkName
    // TypeScript autocompletará esto:
    console.log(item.name); // Nombre del proyecto (si hay colisión, revisar estrategia de nombres)
    
    // *Nota sobre colisiones*: Si una relación trae campos con el mismo nombre que el padre,
    // se recomienda seleccionar campos específicos o manejar la intersección.
  });
}
```

### Crear o Actualizar (SetEntry)

```typescript
await service.setEntry({
  module: ModuloFitac,
  fields: {
    name: 'Nuevo Registro',
    documentName: 'DOC-001',
    // Los campos se convierten automáticamente a snake_case para la API
  }
});
```

## Estructura del Proyecto

```
src/
├── domain/
│   ├── abstracts/      # Clases base (SuiteCrmModule)
│   └── types/          # Tipos utilitarios (FlattenedModule, etc.)
├── infrastructure/
│   ├── services/       # SuiteCrmService
│   └── utils/          # Case converters
└── index.ts            # Public API
```

## Licencia

ISC
