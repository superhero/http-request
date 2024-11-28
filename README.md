# HTTP-Request

An HTTP client for Node.js supporting HTTP/1.1 and HTTP/2.0, with support for retries, timeouts, and streaming.

## Features

- **Protocol Support**: HTTP/1.1 and HTTP/2.0.
- **HTTP Methods**: Supports all standard methods—GET, POST, PUT, PATCH, DELETE, HEAD, OPTIONS, TRACE.
- **Retries**: Configurable retry mechanism for requests.
- **Timeouts**: Set request timeouts to prevent hanging requests.
- **Streaming**: Stream request bodies and responses (upstream and downstream).
- **Data Handling**: Automatically handles JSON and URL-encoded form data.
- **Customizable**: Configure headers, body, query parameters, and more.

## Installation

Install via npm:

```bash
npm install @superhero/http-request
```

## Usage

### Importing the Module

```javascript
import Request from '@superhero/http-request'
```

### Creating a Request Instance

```javascript
const request = new Request({
  base        : 'https://example.com',
  headers     : { 'Content-Type': 'application/json' },
  timeout     : 5e3,  // 5 seconds
  retry       : 3,    // Retry up to 3 times
  retryDelay  : 200   // 200ms delay between retries
})
```

### Making Requests

Use the methods corresponding to HTTP verbs:

- `get(options)`
- `post(options)`
- `put(options)`
- `patch(options)`
- `delete(options)`
- `head(options)`
- `options(options)`
- `trace(options)`

Each method accepts an `options` object.

#### Example: GET Request

```javascript
const response = await request.get('/users')

console.log(response.status)   // HTTP status code
console.log(response.headers)  // Response headers
console.log(response.body)     // Parsed response body
```

#### Example: POST Request with JSON Body

```javascript
const response = await request.post({
  url  : '/users',
  body : { name: 'John Doe', email: 'john@example.com' }
})

console.log(response.status)
console.log(response.body)
```

#### Example: PUT Request with Form Data

```javascript
const response = await request.put({
  url     : '/users/123',
  headers : { 'Content-Type': 'application/x-www-form-urlencoded' },
  body    : { name: 'Jane Doe', email: 'jane@example.com' }
})

console.log(response.status)
console.log(response.body)
```

### Handling Errors

Errors are thrown with specific error codes for easier handling:

- `E_HTTP_REQUEST_CLIENT_ERROR`
- `E_HTTP_REQUEST_CLIENT_TIMEOUT`
- `E_HTTP_REQUEST_DOWNSTREAM_ERROR`
- `E_HTTP_REQUEST_INVALID_RESPONSE_BODY_FORMAT`
- `E_HTTP_REQUEST_INVALID_RESPONSE_STATUS`

Example:

```javascript
try {
  const response = await request.get({ url: '/data' })
} 
catch (error) {
  console.error('Request failed:', error.message, error.code)
}
```

### Configuring Retries and Timeouts

```javascript
const response = await request.get({
  url: '/unstable-endpoint',
  timeout: 3000,              // 3 seconds timeout
  retry: 5,                   // Retry up to 5 times
  retryDelay: 500,            // 500ms delay between retries
  retryOnClientTimeout: true  // Retry if client times out
})
```

### Streaming Data

#### Streaming Request Body (Upstream)

Stream data to the server using the `upstream` option with a readable stream.

```javascript
import { Readable } from 'node:stream'

const upstream = Readable.from(['streaming ', 'data ', 'to ', 'server'])

const response = await request.post({
  url: '/upload',
  upstream
})
```

#### Streaming Response Body (Downstream)

Stream the response data from the server using the `downstream` option with a writable stream.

```javascript
import { createWriteStream } from 'node:fs'

const downstream = createWriteStream('output.txt')

const response = await request.get({
  url: '/download',
  downstream
})

downstream.on('finish', () => {
  console.log('Download completed.')
})
```

### Using HTTP/2

Establish a connection for HTTP/2 requests.

```javascript
await request.connect('http://api.example.com')

// Now you can make HTTP/2 requests
const response = await request.get({ url: '/users' })

// Close the connection when done
await request.close()
```

## API Reference

### Class: Request

#### Constructor

```javascript
new Request(config)
```

- `config`: An object containing default request configurations.

#### Methods

- **connect(authority, [options])**
  - Connects to an HTTP/2 server.
  - `authority`: The URL to connect to.
  - `options`: Optional connection options.

- **close()**
  - Closes the HTTP/2 client connection.

- **get(options)**
  - Makes a GET request.

- **post(options)**
  - Makes a POST request.

- **put(options)**
  - Makes a PUT request.

- **patch(options)**
  - Makes a PATCH request.

- **delete(options)**
  - Makes a DELETE request.

- **head(options)**
  - Makes a HEAD request.

- **options(options)**
  - Makes an OPTIONS request.

- **trace(options)**
  - Makes a TRACE request.

#### Request Options

- **url**: The endpoint URL (relative to `base` if provided).
- **base**: The base URL for resolving relative URLs.
- **headers**: An object containing request headers.
- **body** or **data**: The request payload (object or string).
- **method**: HTTP method (overrides method implied by the function used).
- **timeout**: Request timeout in milliseconds.
- **retry**: Number of retry attempts on failure.
- **retryDelay**: Delay between retries in milliseconds.
- **retryOnStatus**: Array of HTTP status codes to trigger a retry.
- **retryOnClientTimeout**: Retry on client timeout (`true` or `false`).
- **retryOnDownstreamError**: Retry on downstream errors (`true` or `false`).
- **retryOnInvalidResponseBodyFormat**: Retry if response body format is invalid (`true` or `false`).
- **retryOnErrorResponseStatus**: Retry on error HTTP statuses (`true` or `false`).
- **doNotThrowOnErrorStatus**: Do not throw on error statuses (`true` or `false`).
- **doNotThrowOnRedirectStatus**: Do not throw on redirect statuses (`true` or `false`).
- **upstream**: A `Readable` stream to pipe the request body from.
- **downstream**: A `Writable` stream to pipe the response body to.

#### Response Object

- **status**: HTTP status code of the response.
- **headers**: Response headers as an object.
- **body**: Parsed response body. If the response is JSON, it's parsed automatically. If `downstream` is used, `body` is omitted.

## Testing

The test suite uses Node.js's built-in `node:test` module.

### Running the Tests

To run the tests, execute:

```bash
node test.js
```

### Test Coverage

```
▶ @superhero/http-request
  ▶ HTTP 1.1
    ▶ Request using method
      ✔ POST (29.927617ms)
      ✔ PUT (6.608225ms)
      ✔ PATCH (4.07807ms)
      ✔ GET (4.255941ms)
      ✔ DELETE (5.305515ms)
      ✔ HEAD (4.096928ms)
      ✔ OPTIONS (4.635634ms)
      ✔ TRACE (4.071535ms)
    ✔ Request using method (64.83487ms)

    ✔ Request using the URL as the option parameter (8.577185ms)
    ✔ Request using a string body (5.060509ms)
    ✔ Request using a custom header (3.345092ms)
    ✔ Normalizes headers and body (2.763181ms)
    ✔ Can pipe upstream body through the request from a readable stream (6.058912ms)
    ✔ Can pipe downstream response from the request to a writable stream (5.560773ms)

    ▶ Tests that require an altered server response
      ✔ Supports request timeout (106.042009ms)
      ✔ Rejects invalid JSON response accurately (4.167691ms)
      ✔ Retry on client error (214.183201ms)
      ✔ Retry on client timeout (311.841398ms)
      ✔ Retry on invalid response body format (208.378113ms)

      ▶ Retry on response status
        ✔ Retry on status: 503 - should succeed after re-attempts (209.880754ms)
        ✔ Retry on status: 503 - should reject after to few re-attempts (108.7312ms)
        ✔ Retry on status: 500 - should reject on first attempt (4.106091ms)

        ▶ Retry on error response status
          ✔ Should succeed after re-attempts (212.3066ms)
          ✔ Should succeed after re-attempts when "doNotThrowOnErrorStatus" (8.122609ms)
        ✔ Retry on error response status (222.080598ms)
      ✔ Retry on response status (547.205892ms)
    ✔ Tests that require an altered server response (1392.469482ms)
  ✔ HTTP 1.1 (1489.71029ms)

  ▶ HTTP 2.0
    ▶ Request using method
      ✔ POST (24.172115ms)
      ✔ PUT (4.569734ms)
      ✔ PATCH (5.478934ms)
      ✔ GET (3.347633ms)
      ✔ DELETE (4.18065ms)
      ✔ HEAD (2.557823ms)
      ✔ OPTIONS (3.031275ms)
      ✔ TRACE (4.541577ms)
    ✔ Request using method (52.666782ms)

    ✔ Request using the URL as the option parameter (3.139841ms)
    ✔ Request using a string body (3.152696ms)
    ✔ Request using a custom header (2.364444ms)
    ✔ Normalizes headers and body (3.156592ms)
    ✔ Can pipe upstream body through the request from a readable stream (4.870264ms)
    ✔ Can pipe downstream response from the request to a writable stream (2.96681ms)

    ▶ Tests that require an altered server response
      ✔ Retry on connection error (212.816865ms)
      ✔ Supports request timeout (108.664584ms)
    ✔ Tests that require an altered server response (322.005974ms)
  ✔ HTTP 2.0 (394.95823ms)
✔ @superhero/http-request (1885.245212ms)

tests 42
suites 7
pass 42

------------------------------------------------------------------------
file            | line % | branch % | funcs % | uncovered lines
------------------------------------------------------------------------
index.js        |  97.16 |    92.45 |   95.12 | 487-496 524-526 662-668
index.test.js   | 100.00 |    97.67 |  100.00 | 
------------------------------------------------------------------------
all files       |  98.41 |    94.79 |   98.10 | 
------------------------------------------------------------------------
```

---

## License
This project is licensed under the MIT License.

---

## Contributing
Feel free to submit issues or pull requests for improvements or additional features.
