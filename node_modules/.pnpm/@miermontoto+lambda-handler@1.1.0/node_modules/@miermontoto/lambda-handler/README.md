# @miermontoto/lambda-handler

[![npm](https://img.shields.io/npm/v/@miermontoto/lambda-handler)](https://www.npmjs.com/package/@miermontoto/lambda-handler)

Base handler class for AWS Lambda with middleware support and health checks. Simplifies Lambda development with routing, error handling, warmup support, and common utilities for parsing requests.

## Installation

```bash
pnpm add @miermontoto/lambda-handler
```

## Configuration

```typescript
interface HandlerConfig {
  healthCheckPath?: string;   // default '/health'
  enableCors?: boolean;       // default true
  enableLogging?: boolean;    // default true
  warmupPath?: string;       // path for warmup events
}
```

## Usage

### Basic Handler Class

```typescript
import { BaseHandler } from '@miermontoto/lambda-handler';
import { badRequest, ok } from '@miermontoto/lambda-responses';

class MyHandler extends BaseHandler {
  constructor() {
    super({
      healthCheckPath: '/health',
      enableLogging: true,
    });
  }

  protected async handleRoutes(event, context, callback) {
    const path = event.rawPath;
    const method = event.requestContext.http.method;

    if (path === '/users' && method === 'GET') {
      return ok({ users: [] });
    }

    if (path === '/users' && method === 'POST') {
      const body = JSON.parse(event.body || '{}');
      return ok({ created: body });
    }

    return badRequest('Route not found');
  }
}

export const handler = new MyHandler().handler;
```

### Simple Handler

```typescript
import { createHandler, parseBody } from '@miermontoto/lambda-handler';
import { ok, badRequest } from '@miermontoto/lambda-responses';

export const handler = createHandler(async (event) => {
  const body = parseBody(event);

  if (!body) {
    return badRequest('Body required');
  }

  // process request
  return ok({ processed: body });
});
```

### With Middleware

```typescript
import { BaseHandler } from '@miermontoto/lambda-handler';

class MyHandler extends BaseHandler {
  constructor() {
    super();

    // add authentication middleware
    this.use(async (event, context, next) => {
      const token = event.headers.authorization;

      if (!token) {
        return unauthorized('Token required');
      }

      // validate token...
      return next();
    });

    // add logging middleware
    this.use(async (event, context, next) => {
      console.log('Request:', event.rawPath);
      const result = await next();
      console.log('Response:', result.statusCode);
      return result;
    });
  }

  protected async handleRoutes(event, context, callback) {
    // your routes here
  }
}
```

### Error Handling

```typescript
class MyHandler extends BaseHandler {
  constructor() {
    super();

    // set custom error handler
    this.setErrorHandler((error, event, context) => {
      console.error('Custom error handler:', error);

      if (error.name === 'ValidationError') {
        return badRequest(error.message);
      }

      return serverError('Something went wrong');
    });
  }
}
```

## Helper Functions

- `parseBody(event)` - Parse JSON body from event
- `getQueryParams(event)` - Get query string parameters
- `getPathParams(event)` - Get path parameters
- `getHeaders(event)` - Get request headers
- `getHttpMethod(event)` - Get HTTP method
- `getPath(event)` - Get request path
- `isWarmupEvent(event)` - Check if it's a warmup event
- `isHealthCheck(event, path)` - Check if it's a health check

## License

CC BY-NC-ND 4.0