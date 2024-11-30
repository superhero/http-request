import http                   from 'node:http'
import https                  from 'node:https'
import http2                  from 'node:http2'
import querystring            from 'node:querystring'
import { URL }                from 'node:url'
import { setTimeout as wait } from 'node:timers/promises'

/**
 * @typedef {Object} RequestResponse
 * 
 * @property {Number} status - The HTTP status code of the response.
 * @property {Object.<String, String>} headers - The headers of the response.
 * @property {Object|String} body - The response body. If the content type is JSON, the body is parsed. 
 *                                  If a downstream stream is provided, the body is piped to the downstream 
 *                                  and this body field is omitted.
 */

/**
 * @typedef {Object} RequestOptions
 * 
 * @property {String} url   - The URL to make the request to.
 * @property {String} base  - The base path to resolve the URL against.
 * @property {Object.<String, String>} [headers] - The request headers.
 * @property {Object|String} [body] - The request body.
 * @property {Object|String} [data] - Alias for body.
 * @property {Number} [timeout] - The request timeout in milliseconds.
 * @property {Number} [retry] - The number of times to retry the request.
 * @property {Number} [retryDelay] - The delay between retries in milliseconds.
 * @property {Number[]} [retryOnStatus] - The HTTP status codes to retry on.
 * @property {Boolean} [retryOnClientTimeout] - Whether to retry on client timeout.
 * @property {Boolean} [retryOnDownstreamError] - Whether to retry on downstream error.
 * @property {Boolean} [retryOnInvalidResponseBodyFormat] - Whether to retry on invalid response body format.
 * @property {Boolean} [retryOnErrorResponseStatus] - Whether to retry on invalid response status.
 * @property {Boolean} [doNotThrowOnErrorStatus] - Set to true to avoid throwing on error status.
 * @property {Boolean} [doNotThrowOnRedirectStatus] - Set to true to avoid throwing on redirect status.
 * @property {Stream.Readable>} [upstream] - An optional upstream stream to make it possible to pipe body to the upstream directly.
 * @property {Stream.Writable} [downstream] - An optional downstream stream to make it possible to pipe body from the downstream to.
 * @property {String} [method] - The HTTP method to use.
 * 
 * @see {@link https://nodejs.org/api/http.html#httprequestoptions-callback}
 * @see {@link https://nodejs.org/api/https.html#httpsrequestoptions-callback}
 * @see {@link https://nodejs.org/api/net.html#socketconnectoptions-connectlistener}
 */

/**
 * A class for making HTTP/S 1.1 or 2.0 requests.
 * @memberof @superhero/http-request
 */
export default class Request
{
  #config

  /**
   * @param {RequestOptions} config - The default/fallback request options/configurations.
   */
  constructor(config)
  {
    this.#config = 'string' === typeof config
                 ? { base:config }
                 : config || {}

    const { base, url } = this.#config
    this.#config.base = base ?? url
    delete this.#config.url
  }

  /**
   * Connects to a HTTP/2 server.
   * 
   * @param {String} authority the URL
   * @param {Object} [options]
   * 
   * @throws {Error} E_HTTP_REQUEST_CONNECT_INVALID_ARGUMENT
   * 
   * @see {@link https://nodejs.org/api/http2.html#http2connectauthority-options-listener}
   */
  connect(authority, ...args)
  {
    return new Promise(async (accept, reject) =>
    {
      await this.close()

      const url = new URL(authority || this.#config.base)
      authority = url.protocol + '//' + url.host

      this.http2Session = http2.connect(authority, ...args.slice(0, 1), () => 
      {
        this.#config.base = authority
        this.#config.url  = url.pathname + url.search
        this.http2Session.off('error', reject)
        accept()
      })

      this.http2Session.once('error', reject)
      this.http2Session.once('close', () => 
      {
        this.http2Session.removeAllListeners()
        delete this.http2Session
      })
    })
  }

  /**
   * Closes the HTTP/2 client.
   * @param {number} error 
   * @see {@link https://nodejs.org/api/http2.html#http2sessionclosecallback}
   */
  close()
  {
    return new Promise((accept, reject) =>
    {
      if(this.http2Session
      && this.http2Session.closed === false)
      {
        this.http2Session.close((error) =>
        {
          error
          ? reject(error)
          : accept()
        })
      }
      else
      {
        accept()
      }
    })
  }

  /**
   * GET – Read a resource or a collection of resources.
   * Used to retrieve data without modifying it. 
   * Example: fetching user details.
   * 
   * @param {RequestOptions} options
   * @returns {RequestResponse}
   */
  get(options)
  {
    return this.#fetch('GET', options)
  }

  /**
   * POST – Create a new resource.
   * Used to submit data to create a new resource on the server. 
   * Example: creating a new user.
   * 
   * @param {RequestOptions} options
   * @returns {RequestResponse}
   */
  post(options)
  {
    return this.#fetch('POST', options)
  }

  /**
   * PUT – Replace or update a resource completely.
   * Used for updating an existing resource by replacing it entirely. 
   * Example: replacing a user’s details.
   * 
   * @param {RequestOptions} options
   * @returns {RequestResponse}
   */
  put(options)
  {
    return this.#fetch('PUT', options)
  }

  /**
   * PATCH – Partial update of a resource.
   * Used to apply partial modifications, often updating only specific 
   * fields. Example: updating just the email in a user profile.
   * 
   * @param {RequestOptions} options
   * @returns {RequestResponse}
   */
  patch(options)
  {
    return this.#fetch('PATCH', options)
  }

  /**
   * DELETE – Remove a resource.
   * Used to delete an existing resource.
   * 
   * @param {RequestOptions} options
   * @returns {RequestResponse}
   */
  delete(options)
  {
    return this.#fetch('DELETE', options)
  }

  /**
   * HEAD – Get metadata (headers) of a resource without getting the body.
   * Similar to GET but retrieves only headers, often used for checking if 
   * a resource exists without fetching its body.
   * 
   * @param {RequestOptions} options
   * @returns {RequestResponse}
   */
  head(options)
  {
    return this.#fetch('HEAD', options)
  }

  /**
   * OPTIONS – Get information about a resource’s communication options.
   * Used to find out which methods are supported for a specific resource, 
   * helping clients understand server capabilities.
   * 
   * @param {RequestOptions} options
   * @returns {RequestResponse}
   */
  options(options)
  {
    return this.#fetch('OPTIONS', options)
  }

  /**
   * TRACE – Get diagnostic information from the server.
   * Used to retrieve diagnostic information from the server, often used
   * for testing or debugging purposes.
   * Often used to see the path a request takes to reach the server. 
   * Rarely used in REST, primarily for network diagnostics.
   * 
   * @param {RequestOptions} options
   * @returns {RequestResponse}
   */
  trace(options)
  {
    return this.#fetch('TRACE', options)
  }

  /**
   * Generic fetch method.
   * 
   * @param {string} method 
   * @param {RequestOptions} options 
   * @returns {RequestResponse}
   */
  #fetch(method, options)
  {
    if(typeof options === 'string')
    {
      options = { url:options }
    }

    if(this.#config.url && options.url)
    {
      options.url = options.url[0] === '/' 
                  ? options.url
                  : this.#config.url + options.url
    }

    options = Object.assign(
    {
      method,
      headers       : {},
      retry         : 3,
      retryDelay    : 200,
      url           : '',
      timeout       : 30e3,
      retryOnStatus : []
    }, this.#config, options)

    return options.retry
    ? this.#resolveRetryLoop(options)
    : this.#resolve(options)
  }

  /**
   * Resolves the request.
   * 
   * @param {String}          method
   * @param {RequestOptions}  options
   * 
   * @returns {RequestResponse}
   * 
   * @throws {Error} E_HTTP_REQUEST_CLIENT_TIMEOUT
   * @throws {Error} E_HTTP_REQUEST_CLIENT_ERROR
   * @throws {Error} E_HTTP_REQUEST_DOWNSTREAM_ERROR
   * @throws {Error} E_HTTP_REQUEST_INVALID_RESPONSE_BODY_FORMAT
   */
  #resolve(options)
  {
    return new Promise((accept, reject) =>
    {
      const
        method    = options.method,
        headers   = this.#normalizeHeaders(options.headers),
        body      = this.#normalizeBody(options.body ?? options.data, headers['content-type']),
        delimiter = this.#createBodyHeaderDelimiter(body, !!options.upstream || !!this.http2Session),
        url       = this.#normalizeUrl(options.url, options.base)

      Object.assign(headers, delimiter)

      const upstream = this.http2Session
      ? this.#resolveHttp2Client(options, method, headers, url, accept, reject)
      : this.#resolveHttp1Client(options, method, headers, url, accept, reject)

      options.upstream
      ? options.upstream.pipe(upstream)
      : upstream.writable && upstream.end(body)
    })
  }

  #resolveHttp2Client(options, method, headers, url, accept, reject)
  {
    delete headers['transfer-encoding']

    const { pathname, search } = new URL(url)
    const upstream = this.http2Session.request(
    {
      [http2.constants.HTTP2_HEADER_METHOD] : method,
      [http2.constants.HTTP2_HEADER_PATH]   : pathname + search,
      ...headers
    }, options)

    upstream.on('close', this.#connectionClosed     .bind(this, upstream, reject))
    upstream.on('error', this.#resolveOnClientError .bind(this, method, url, reject))

    if(options.timeout)
    {
      upstream.setTimeout(options.timeout, this.#resolveOnClientTimeout.bind(this, upstream, options.timeout, method, url, reject))
    }

    upstream.on('response', (headers) => 
    {
      const
        SENSITIVE_HEADERS = http2.sensitiveHeaders,
        HEADER_STATUS     = http2.constants.HTTP2_HEADER_STATUS

      upstream.statusCode = headers[HEADER_STATUS]
      upstream.headers    = { ...headers }

      delete upstream.headers[HEADER_STATUS]
      Object.defineProperty(headers, SENSITIVE_HEADERS, { value:headers[SENSITIVE_HEADERS] })

      this.#resolveOnResponse(options, method, url, accept, reject, upstream)
    })

    return upstream
  }

  #resolveHttp1Client(options, method, headers, url, accept, reject)
  {
    const
      request   = url.protocol === 'https:' ? https.request : http.request,
      config    = Object.assign({}, options, { headers }),
      upstream  = request(url, config)

    upstream.on('close',    this.#connectionClosed      .bind(this, upstream, reject))
    upstream.on('error',    this.#resolveOnClientError  .bind(this, method, url, reject))
    upstream.on('timeout',  this.#resolveOnClientTimeout.bind(this, upstream, options.timeout, method, url, reject))
    upstream.on('response', this.#resolveOnResponse     .bind(this, options, method, url, accept, reject))

    return upstream
  }

  #connectionClosed(upstream, reject)
  {
    upstream.removeAllListeners()
    const error = new Error('The connection was closed unexpectedly')
    error.code  = 'E_HTTP_REQUEST_CLIENT_ERROR'
    setImmediate(() => reject(error)) // this error is a fallback if the promise is not already resolved
  }

  /**
   * Resolves the response.
   * 
   * @param {RequestOptions} options
   * @param {String} method
   * @param {String} url
   * @param {Function} accept Promise accept
   * @param {Function} reject Promise reject
   * @param {http.IncomingMessage} readable
   * 
   * @returns {Void}
   */
  #resolveOnResponse(options, method, url, accept, reject, readable)
  {
    const response =
    {
      status  : readable.statusCode,
      headers : readable.headers
    }

    if((response.status >= 400 && false === !!options.doNotThrowOnErrorStatus)
    || (response.status >= 300 && false === !!options.doNotThrowOnRedirectStatus && response.status < 400))
    {
      const error     = new Error(`Invalid HTTP status ${response.status} ${method} -> ${url}`)
      error.code      = 'E_HTTP_REQUEST_INVALID_RESPONSE_STATUS'
      error.response  = response

      new Promise(this.#bufferResponseBody.bind(this, readable, response, method, url))
        .catch((reason) => error.cause = reason)
        .finally(() => reject(error))
    }
    else if(options.downstream)
    {
      readable.pipe(options.downstream)
      readable.resume()
      accept(response)
    }
    else
    {
      this.#bufferResponseBody(readable, response, method, url, accept, reject)
    }
  }

  /**
   * Resolves the request in a retry loop.
   * 
   * @param {RequestOptions} options
   * 
   * @returns {RequestResponse}
   * 
   * @throws {Error} E_HTTP_REQUEST_RETRY
   */
  async #resolveRetryLoop(options)
  {
    const errorTrace = []

    let retry = Math.abs(Math.floor(options.retry))

    while(retry--)
    {
      try
      {
        const response = await this.#resolve(options)

        if(response.status >= 400
        && retry > 0 
        &&(options.retryOnStatus.includes(response.status)
        || options.retryOnErrorResponseStatus))
        {
          continue
        }
        else
        {
          return response
        }
      }
      catch(error)
      {
        if(retry === 0)
        {
          throw error
        }
        else
        {
          this.#resolveRetryLoopError(options, errorTrace, error)
          await wait(options.retryDelay)
        }
      }
    }
  }

  /**
   * Resolves the error in the retry loop.
   * 
   * @param {RequestOptions}  options
   * @param {Error[]}         errorTrace
   * @param {Error}           error
   * 
   * @returns {Void}
   * 
   * @throws {Error} E_HTTP_REQUEST_CLIENT_ERROR
   * @throws {Error} E_HTTP_REQUEST_CLIENT_TIMEOUT
   * @throws {Error} E_HTTP_REQUEST_DOWNSTREAM_ERROR
   * @throws {Error} E_HTTP_REQUEST_INVALID_RESPONSE_BODY_FORMAT
   * @throws {Error} E_HTTP_REQUEST_INVALID_RESPONSE_STATUS
   */
  #resolveRetryLoopError(options, errorTrace, error)
  {
    switch(error.code)
    {
      case 'E_HTTP_REQUEST_CLIENT_ERROR':
      {
        return errorTrace.push(error)
      }
      case 'E_HTTP_REQUEST_CLIENT_TIMEOUT':
      {
        if(options.retryOnClientTimeout)
        {
          return errorTrace.push(error)
        }
        else
        {
          throw error
        }
      }
      case 'E_HTTP_REQUEST_DOWNSTREAM_ERROR':
      {
        if(options.retryOnDownstreamError)
        {
          return errorTrace.push(error)
        }
        else
        {
          throw error
        }
      }
      case 'E_HTTP_REQUEST_INVALID_RESPONSE_BODY_FORMAT':
      {
        if(options.retryOnInvalidResponseBodyFormat)
        {
          return errorTrace.push(error)
        }
        else
        {
          throw error
        }
      }
      case 'E_HTTP_REQUEST_INVALID_RESPONSE_STATUS':
      {
        if(options.retryOnErrorResponseStatus)
        {
          return errorTrace.push(error)
        }
        else if(options.retryOnStatus.includes(error.response.status))
        {
          return errorTrace.push(error)
        }
        else
        {
          throw error
        }
      }
      default:
      {
        throw error
      }
    }
  }

  #createBodyHeaderDelimiter(body, isStreamed)
  {
    return isStreamed
    ? { 'transfer-encoding': 'chunked' }
    : { 'content-length' : body.length }
  }

  /**
   * Normalizes the headers to lowercase keys.
   * @param {Object} headers 
   * @returns {Object} Normalized headers
   */
  #normalizeHeaders(headers)
  {
    const
      headerKeys = Object.keys(headers),
      normalized = {}

    headerKeys.forEach((key) => normalized[key.toLowerCase()] = headers[key])

    return normalized
  }

  /**
   * Normalizes the body to a string.
   * 
   * @param {Object|String} body 
   * @param {String} [contentType] 
   * 
   * @returns {String} Normalized body
   */
  #normalizeBody(body, contentType)
  {
    if('string' === typeof body)
    {
      return body
    }
    else if(contentType?.startsWith('application/json'))
    {
      return JSON.stringify(body)
    }
    else
    {
      return querystring.stringify(body)
    }
  }

  /**
   * Normalizes the URL.
   * 
   * @param {String} url
   * @param {String} base
   * 
   * @returns {String} Normalized URL
   */
  #normalizeUrl(url, base)
  {
    return url
    ? new URL(url, base).toString()
    : new URL(base).toString()
  }

  /**
   * Resolves the client error.
   * 
   * @param {String} method
   * @param {String} url
   * @param {Function} reject Promise reject
   * @param {Error} reason
   * 
   * @returns {Void}
   * 
   * @throws {Error} E_HTTP_REQUEST_CLIENT_ERROR
   */
  #resolveOnClientError(method, url, reject, reason)
  {
    if(reason.code === 'E_HTTP_REQUEST_CLIENT_TIMEOUT')
    {
      return reject(reason)
    }
    else
    {
      const error = new Error(`Client error ${method} → ${url}`)
      error.code  = 'E_HTTP_REQUEST_CLIENT_ERROR'
      error.cause = reason
      reject(error)
    }
  }

  /**
   * Resolves the client timeout.
   * 
   * @param {http.ClientRequest} upstream
   * @param {Number} timeout
   * @param {String} method
   * @param {String} url
   * @param {Function} reject Promise reject
   * 
   * @returns {Void}
   * 
   * @throws {Error} E_HTTP_REQUEST_CLIENT_TIMEOUT
   */
  #resolveOnClientTimeout(upstream, timeout, method, url, reject)
  {
    const error = new Error(`Client timed out (${(timeout / 1e3).toFixed(1)}s) ${method} → ${url}`)
    error.code  = 'E_HTTP_REQUEST_CLIENT_TIMEOUT'

    upstream.destroy(error)
  }

  #bufferResponseBody(readable, response, method, url, accept, reject)
  {
    response.body = ''
    readable.on('data',   (chunk) => response.body += chunk)
    readable.on('error',  this.#onStreamError.bind(this, method, url, response))
    readable.on('end',    this.#onStreamEnd  .bind(this, method, url, response, accept, reject))
    readable.resume()
  }

  /**
   * Resolves the downstream error.
   * 
   * @param {String} method 
   * @param {String} url 
   * @param {http.IncomingMessage} response 
   * @param {Error} reason
   * 
   * @returns {void}
   * 
   * @throws {Error} E_HTTP_REQUEST_DOWNSTREAM_ERROR
   */
  #onStreamError(method, url, response, reason)
  {
    const error     = new Error(`Downstream error [${reason.code}] ${method} -> ${url}`)
    error.code      = 'E_HTTP_REQUEST_DOWNSTREAM_ERROR'
    error.cause     = reason
    error.response  = response
    reject(error)
  }

  /**
   * Resolves the response end.
   * 
   * @param {String} method
   * @param {String} url
   * @param {http.IncomingMessage} response
   * @param {Function} accept promise accept
   * @param {Function} reject promise reject
   * 
   * @returns {void}
   * 
   * @throws {Error} E_HTTP_REQUEST_INVALID_RESPONSE_BODY_FORMAT
   */
  #onStreamEnd(method, url, response, accept, reject)
  {
    if(response.headers['content-type']?.startsWith('application/json'))
    {
      try
      {
        response.body = JSON.parse(response.body || '{}')
      }
      catch(reason)
      {
        const error     = new TypeError(`Invalid JSON format ${method} -> ${url}`)
        error.code      = 'E_HTTP_REQUEST_INVALID_RESPONSE_BODY_FORMAT'
        error.cause     = reason
        error.response  = response
        reject(error)
        return 
      }
    }

    accept(response)
  }
}
