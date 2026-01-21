# @miermontoto/lambda-responses

[![npm](https://img.shields.io/npm/v/@miermontoto/lambda-responses)](https://www.npmjs.com/package/@miermontoto/lambda-responses)

Consistent HTTP response helpers for AWS Lambda functions. Provides type-safe response methods for all standard HTTP status codes with automatic CORS headers and error formatting.

## Installation

```bash
pnpm add @miermontoto/lambda-responses
```

## Configuration

```typescript
interface ResponseOptions {
  headers?: Record<string, string>;
  cors?: boolean;  // default true
}

interface ErrorResponseOptions {
  statusCode?: number;
  error?: string;
  details?: any;
}
```

## Usage

```typescript
import { ok, badRequest, serverError, notFound } from '@miermontoto/lambda-responses';
import { APIGatewayProxyHandlerV2 } from 'aws-lambda';

export const handler: APIGatewayProxyHandlerV2 = async (event) => {
  try {
    // validate input
    if (!event.body) {
      return badRequest('Request body is required');
    }

    // process request
    const data = JSON.parse(event.body);

    // return success
    return ok({
      message: 'Success',
      data: data
    });

  } catch (error) {
    // return error
    return serverError(error);
  }
};
```

## Available Methods

### Success Responses
- `ok(body?, options?)` - 200 OK
- `created(body?, options?)` - 201 Created
- `noContent(options?)` - 204 No Content

### Client Error Responses
- `badRequest(message?, options?)` - 400 Bad Request
- `unauthorized(message?, options?)` - 401 Unauthorized
- `forbidden(message?, options?)` - 403 Forbidden
- `notFound(message?, options?)` - 404 Not Found
- `conflict(message?, options?)` - 409 Conflict
- `unprocessableEntity(message?, options?)` - 422 Unprocessable Entity
- `tooManyRequests(message?, options?)` - 429 Too Many Requests

### Server Error Responses
- `serverError(message?, options?)` - 500 Internal Server Error
- `badGateway(message?, options?)` - 502 Bad Gateway
- `serviceUnavailable(message?, options?)` - 503 Service Unavailable

### Other
- `customResponse(statusCode, body, options?)` - Custom status code
- `redirect(location, statusCode?)` - Redirect response
- `createResponse(statusCode, body, options?)` - Base response builder

## License

CC BY-NC-ND 4.0