# open69b

Servicio de consulta rápida para la lista 69-B del SAT (contribuyentes con operaciones presuntamente inexistentes).

## Descripción

- **Fuente**: [CSV 69-B del SAT](http://omawww.sat.gob.mx/cifras_sat/Documents/Listado_Completo_69-B.csv) (~14k registros)
- **Stack**: Serverless Framework v4, AWS Lambda (Node.js 22.x), ElastiCache Redis
- **Latencia**: Consultas sub-milisegundo vía Redis

## Endpoints

| Endpoint | Método | Auth | Descripción |
|----------|--------|------|-------------|
| `/health` | GET | Público | Health check |
| `/metadata` | GET | Público | Estadísticas y última sincronización |
| `/status/{rfc}` | GET | 🔒 | Consultar RFC en lista 69-B |
| `/sync` | POST | 🔒 | Sincronización manual desde SAT |

### Autenticación

Los endpoints protegidos requieren header `x-api-key`:

```bash
curl -H "x-api-key: TU_API_KEY" https://69b.okticket.io/status/AAA080808HL8
```

### Ejemplo de respuesta

```json
{
  "rfc": "AAA080808HL8",
  "found": true,
  "status": "Sentencia Favorable",
  "nombre": "EMPRESA EJEMPLO SA DE CV",
  "record": {
    "rfc": "AAA080808HL8",
    "situacion": "Sentencia Favorable",
    "presuncion": { "oficioSat": "...", "fechaSat": "01/06/2018", ... },
    "desvirtuado": { ... },
    "definitivo": { ... },
    "sentenciaFavorable": { ... }
  }
}
```

## Desarrollo local

```bash
# instalar dependencias
pnpm install

# iniciar servidor local (requiere Redis en puerto 6380)
pnpm offline

# ejecutar tests
pnpm test

# tests con cobertura
pnpm test:coverage
```

## Despliegue

```bash
pnpm deploy
```

### Infraestructura

- **VPC** con subnets públicas/privadas
- **NAT Gateway** para acceso a internet (descarga CSV)
- **ElastiCache Redis** para almacenamiento
- **S3** para backups del CSV
- **Dominio**: `69b.okticket.io`

## Variables de entorno

| Variable | Descripción | Default |
|----------|-------------|---------|
| `API_KEY` | Token de auth (vacío = deshabilitado) | - |
| `REDIS_HOST` | Endpoint de Redis | localhost |
| `REDIS_PORT` | Puerto de Redis | 6379 |
| `SAT_CSV_URL` | URL del CSV del SAT | URL oficial |

## Sincronización automática

Sync diario a las 3:00 AM UTC vía CloudWatch Events.
