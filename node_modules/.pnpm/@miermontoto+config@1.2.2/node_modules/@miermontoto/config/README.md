# @miermontoto/config

[![npm](https://img.shields.io/npm/v/@miermontoto/config)](https://www.npmjs.com/package/@miermontoto/config)

Configuration management wrapper for AWS Secrets Manager with environment variable fallback. Provides a simple API for retrieving configuration values from multiple sources with built-in error handling.

## Installation

```bash
pnpm add @miermontoto/config
```

## Configuration

The package uses the following environment variable:

- `AWS_SECRET_ID`: Name of the Secrets Manager secret container holding configuration values (optional).

If `AWS_SECRET_ID` is not set, the config will only read from environment variables and a warning will be logged. AWS credentials are automatically loaded from the environment or IAM role when Secrets Manager is used.

## Usage

```typescript
import { config } from '@miermontoto/config';

// async get() - checks env vars, then AWS Secrets Manager, then default
const apiKey = await config.get('API_KEY', 'default-key'); // type: string
const dbHost = await config.get('DB_HOST'); // type: string | undefined

// sync getSync() - only checks env vars (no AWS calls)
const port = config.getSync('PORT', '3000'); // type: string
const env = config.getSync('NODE_ENV'); // type: string | undefined

// singleton instance
import { Config } from '@miermontoto/config';
const configInstance = Config.getInstance();
```

### Type Safety

Both `get()` and `getSync()` use TypeScript function overloads for enhanced type safety:

- **With default value**: Returns `string` (never undefined)
- **Without default value**: Returns `string | undefined`

```typescript
// no casting needed when providing a default value
const port: string = config.getSync('PORT', '3000'); // ✓
const key: string = await config.get('API_KEY', 'fallback'); // ✓
```

## How it works

### `get()` - Async method with full fallback chain

Retrieves configuration values in the following order:

1. **Environment variables**: First checks `process.env[key]`
2. **AWS Secrets Manager**: If not found in env and `AWS_SECRET_ID` is configured, fetches from the secret
3. **Default value**: Returns the provided default if not found in either source

Errors from Secrets Manager are logged but don't throw - the method falls back to the default value.

### `getSync()` - Synchronous method for environment variables only

Returns values from `process.env[key]` or the default value. No AWS calls are made.

**Use `getSync()` when:**
- You only need environment variables
- You can't use async/await (e.g., in constructors or class property initializers)
- You want to avoid the network overhead of AWS calls

**Use `get()` when:**
- You need to check AWS Secrets Manager
- You want the full fallback chain

## License

CC BY-NC-ND 4.0
