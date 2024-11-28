import assert   from 'node:assert'
import http     from 'node:http'
import http2    from 'node:http2'
import Request  from '@superhero/http-request'
import { once } from 'events'
import { Readable, Writable }                 from 'node:stream'
import { suite, test, beforeEach, afterEach } from 'node:test'

suite('@superhero/http-request', () => 
{
  let server, request, baseUrl

  function executeTheSameTestSuitFor_http1_http2()
  {
    suite('Request using method', () =>
    {
      const methods = 
      [
        { method: 'POST',   body: { key: 'foo' } },
        { method: 'PUT',    body: { key: 'bar' } },
        { method: 'PATCH',  body: { key: 'baz' } },
        { method: 'GET'     },
        { method: 'DELETE'  },
        { method: 'HEAD'    },
        { method: 'OPTIONS' },
        { method: 'TRACE'   }
      ]
      
      for (const { method, body } of methods) 
      {
        test(method, async () => 
        {
          const 
            options   = body ? { body, headers: { 'Content-Type': 'application/json' } } : {},
            response  = await request[method.toLowerCase()]({ url: `/test-${method}`, ...options })
      
          assert.equal(response.status, 200, `Should return a 200 status code for ${method}`)
    
          if(method === 'HEAD') return // HEAD requests does not have a body to validate
    
          assert.equal(response.body.method, method, `Should report method as ${method}`)
          assert.equal(response.body.url, `/test-${method}`, `Should request /test-${method}`)
      
          body && assert.deepEqual(response.body.body, body, `Should send correct body for ${method}`)
        })
      }
    })

    test('Request using the URL as the option parameter', async () =>
    {
      const response = await request.get('/')
      assert.equal(response.status, 200, 'Should return a 200 status code')
      assert.equal(response.body.url, '/', 'Should result to /')
    })

    test('Request using a string body', async () =>
    {
      const response = await request.post({ body: 'test body' })
      assert.equal(response.status, 200, 'Should return a 200 status code')
      assert.equal(response.body.body, 'test body', 'Should result to the value of the request body')
    })
  
    test('Request using a custom header', async () => 
    {
      const response = await request.get(
      {
        url     : '/header-test',
        headers : { 'custom-header': 'test-value' },
      })
  
      assert.equal(response.status, 200, 'Should return a 200 status code')
      assert.equal(response.body.headers['custom-header'], 'test-value', 'Should return the custom header')
    })

    test('Normalizes headers and body', async () => 
    {
      const response = await request.post(
      {
        url     : '/normalize-test',
        headers : { 'Custom-Header': 'foo' },
        body    : { bar: 'baz' }
      })

      assert.equal(response.status, 200, 'Should return a 200 status code')
      assert.equal(response.body.headers['custom-header'], 'foo', 'Should normalize headers')
      assert.deepEqual(response.body.body, 'bar=baz', 'Should normalize body')
    })

    test('Can pipe upstream body through the request from a readable stream', async () => 
    {
      const 
        upstream  = Readable.from(['test upstream body']),
        response  = await request.post(
        {
          url: '/upstream-test',
          upstream
        })
    
      assert.equal(response.status, 200)
      assert.equal(response.body.body, 'test upstream body')
    })

    test('Can pipe downstream response from the request to a writable stream', async () => 
    {
      let body = ''

      const 
        downstream = new Writable(
        {
          write(chunk, encoding, callback) 
          {
            body += chunk.toString()
            callback()
          }
        }),
        finished = once(downstream, 'finish'),
        response = await request.get(
        {
          url: '/downstream-test',
          downstream
        })

      await finished
    
      assert.equal(response.status, 200, 'Should return a 200 status code')
      assert.doesNotThrow(() => body = JSON.parse(body), 'Should be able to parse body as JSON')
      assert.equal(body.url, '/downstream-test', 'Should be able to pipe downstream body')
    })
  }

  suite('HTTP 1.1', () => 
  {
    beforeEach(async () => 
    {
      server = http.createServer((req, res) => 
      {
        const dto = 
        {
          method  : req.method,
          url     : req.url,
          headers : req.headers,
          body    : ''
        }

        req.on('error', console.error)
        res.on('error', console.error)

        req.on('data', (chunk) =>  dto.body += chunk)
        req.on('end',  () => 
        {
          if(req.headers['content-type'] === 'application/json') 
          {
            dto.body = JSON.parse(dto.body ?? '{}')
          }

          res.writeHead(200, { 'Content-Type': 'application/json' })
          res.end(JSON.stringify(dto))
        })
      })

      await new Promise((accept, reject) =>
      {
        server.on('error', reject)
        server.listen(() => 
        {
          const { port } = server.address()
          baseUrl = `http://localhost:${port}`

          server.off('error', reject)
          request = new Request({ base:baseUrl })
          accept()
        })
      })
    })

    afterEach((done) => server.close(done))

    executeTheSameTestSuitFor_http1_http2()

    suite('Tests that require an altered server response', () =>
    {
      test('Supports request timeout', async () => 
      {
        // Alter the server to delay the response by 0.5 seconds
        server.removeAllListeners('request')
        server.on('request', (req, res) => 
        {
          setTimeout(() => 
          {
            res.writeHead(200, { 'Content-Type': 'application/json' })
            res.end(JSON.stringify({ success: true }))
          }, 500)
        })
  
        const options =
        {
          url     : '/timeout-test',
          timeout : 100 
        }
        await assert.rejects(
          request.get(options),
          (error) => error.code === 'E_HTTP_REQUEST_CLIENT_TIMEOUT',
          'Should throw a timeout error')
      })
  
      test('Rejects invalid JSON response accurately', async () => 
      {
        // Alter the server to respond with invalid JSON
        server.removeAllListeners('request')
        server.on('request', (req, res) => 
        {
          res.writeHead(200, { 'Content-Type': 'application/json' })
          res.end('Invalid JSON')
        })
  
        // Make the request
        await assert.rejects(
          request.get({ url: '/invalid-json' }),
          (error) => error.code === 'E_HTTP_REQUEST_INVALID_RESPONSE_BODY_FORMAT',
          'Should throw a parse error')
      })

      test('Retry on client error', async () => 
      {
        let attempt = 0
  
        // Alter the server to not accept the first two requests
        server.removeAllListeners('request')
        server.on('request', (req, res) => 
        {
          if(++attempt < 3) 
          {
            res.destroy()
          }
          else
          {
            res.writeHead(200, { 'Content-Type': 'application/json' })
            res.end(JSON.stringify({ success: true }))
          }
        })
  
        const response = await request.get(
        {
          url         : `/retry-test`,
          retry       : 3, 
          retryDelay  : 100 
        })
        assert.equal(response.status, 200)
        assert.deepEqual(response.body, { success: true })
        assert.equal(attempt, 3)
      })
  
      test('Retry on client timeout', async () =>
      {
        let attempt = 0
  
        // Alter the server to delay the response by 0.5 seconds the first attempt
        server.removeAllListeners('request')
        server.on('request', (req, res) => 
        {
          attempt++;
  
          if(attempt < 2) 
          {
            setTimeout(() => 
            {
              res.writeHead(200, { 'Content-Type': 'application/json' })
              res.end(JSON.stringify({ success: true }))
            }, 500)
          }
          else
          {
            res.writeHead(200, { 'Content-Type': 'application/json' })
            res.end(JSON.stringify({ success: true }))
          }
        })
  
        const response = await request.get(
        {
          url     : '/timeout-test',
          timeout : 100, 
          retry   : 2, 
          retryOnClientTimeout: true 
        })
        assert.equal(response.status, 200, 'Should eventually return 200 status')
        assert.deepEqual(response.body, { success: true }, 'Should return the correct success body')
        assert.equal(attempt, 2, 'Should make exactly 3 attempts')
      })
  
      test('Retry on invalid response body format', async () => 
      {
        let attempt = 0
      
        // Alter the server to initially return invalid JSON body 
        server.removeAllListeners('request')
        server.on('request', (req, res) => 
        {
          attempt++;
      
          if (attempt < 3) 
          {
            // Return invalid JSON
            res.writeHead(200, { 'Content-Type': 'application/json' })
            res.end('Invalid JSON')
          } 
          else 
          {
            // Return valid JSON after retries
            res.writeHead(200, { 'Content-Type': 'application/json' })
            res.end(JSON.stringify({ success: true }))
          }
        })
      
        const response = await request.get(
        {
          url         : '/retry-invalid-json',
          retry       : 3,
          retryDelay  : 100,
          retryOnInvalidResponseBodyFormat: true
        })
        assert.equal(response.status, 200, 'Should eventually return 200 status')
        assert.deepEqual(response.body, { success: true }, 'Should return the correct success body')
        assert.equal(attempt, 3, 'Should make exactly 3 attempts')
      })
  
      test('Retry on response status', async (sub) => 
      {
        // Close the server that was started before the 
        // sub tests starts another server for each test.
        await new Promise((accept) => server.close(accept))
  
        let attempt
  
        sub.beforeEach(() => 
        {
          // Reset the attempt counter
          attempt = 0
  
          // Alter the server to return a retryable statuses before success
          server.removeAllListeners('request')
          server.on('request', (req, res) => 
          {
            attempt++;
  
            if(attempt < 3) 
            {
              // Respond with the retryable status
              res.writeHead(503, { 'Content-Type': 'application/json' })
              res.end(JSON.stringify({ message: 'Service Unavailable' }))
            } 
            else 
            {
              // Respond with a success status after the third attempt
              res.writeHead(200, { 'Content-Type': 'application/json' })
              res.end(JSON.stringify({ success: true }))
            }
          })
        })
  
        await sub.test('Retry on status: 503 - should succeed after re-attempts', async () =>
        {
          const response = await request.get(
          {
            url           : '/retry-on-status',
            retry         : 3, 
            retryDelay    : 100, 
            retryOnStatus : [ 503 ] 
          })
          assert.equal(response.status, 200, 'Should eventually return 200 status')
          assert.deepEqual(response.body, { success: true }, 'Should return the correct success body')
          assert.equal(attempt, 3, 'Should make exactly 3 attempts')
        })
  
        await sub.test('Retry on status: 503 - should reject after to few re-attempts', async () =>
        {
          const options =
          {
            url           : '/retry-on-status',
            retry         : 2, 
            retryDelay    : 100, 
            retryOnStatus : [ 503 ]
          }
  
          await assert.rejects(
            request.get(options),
            (error) => error.code === 'E_HTTP_REQUEST_INVALID_RESPONSE_STATUS',
            'Should throw an error after the second attempt')
  
          assert.equal(attempt, 2, 'Should make exactly 2 attempts')
        })
  
        await sub.test('Retry on status: 500 - should reject on first attempt', async () =>
        {
          const options =
          { 
            url           : '/retry-on-status',
            retry         : 3, 
            retryDelay    : 100, 
            retryOnStatus : [ 500 ]
          }
  
          await assert.rejects(
            request.get(options),
            (error) => error.code === 'E_HTTP_REQUEST_INVALID_RESPONSE_STATUS',
            'Should throw an error right away')
  
          assert.equal(attempt, 1, 'Should make exactly 1 attempt')
        })
  
        await sub.test('Retry on error response status', async (sub) =>
        {
          // Close the server that was started before the 
          // sub tests starts another server for each test.
          await new Promise((accept) => server.close(accept))

          await sub.test('Should succeed after re-attempts', async () =>
          {
            const response = await request.get(
            {
              url         : '/retry-on-status',
              retry       : 3,
              retryDelay  : 100, 
              retryOnErrorResponseStatus : true
            })
            assert.equal(response.status, 200, 'Should eventually return 200 status')
            assert.deepEqual(response.body, { success: true }, 'Should return the correct success body')
            assert.equal(attempt, 3, 'Should make exactly 3 attempts')
          })
    
          await sub.test('Should succeed after re-attempts when "doNotThrowOnErrorStatus"', async () =>
          {
            const response = await request.get(
            {
              url         : '/retry-on-status',
              retry       : 3,
              retryDelay  : 100, 
              retryOnErrorResponseStatus : true,
              doNotThrowOnErrorStatus    : true
            })
            assert.equal(response.status, 200, 'Should eventually return 200 status')
            assert.deepEqual(response.body, { success: true }, 'Should return the correct success body')
            assert.equal(attempt, 3, 'Should make exactly 3 attempts')
          })
        })
      })
    })
  })

  // ---------
  // HTTP2 2.0
  // ---------

  suite('HTTP 2.0', () => 
  {
    // let server, baseUrl, request
  
    beforeEach(async () => 
    {
      server = http2.createServer()
      
      server.on('stream', (stream, headers) =>
      {
        const 
          method  = headers[':method'],
          path    = headers[':path']

        let body = ''
  
        stream.on('error', console.error)
        stream.on('data', (chunk) => body += chunk)
        stream.on('end',  () => 
        {
          const response = 
          {
            method,
            headers,
            url   : path,
            body  : headers['content-type'] === 'application/json' 
                  ? JSON.parse(body || '{}') 
                  : body
          }

          stream.respond(
          {
            ':status'      : 200,
            'content-type' : 'application/json',
          })

          stream.writable && stream.end(JSON.stringify(response))
        })
      })
  
      await new Promise((accept) => 
      {
        server.listen(async () => 
        {
          const { port } = server.address()
          baseUrl = `http://localhost:${port}`
          request = new Request()
          await request.connect(baseUrl)
          accept()
        })
      })
    })

    afterEach((done) => request.close().then(() => server.close(done)))
  
    executeTheSameTestSuitFor_http1_http2()

    suite('Tests that require an altered server response', () =>
    {
      test('Retry on connection error', async () => 
      {
        let attempts = 0
    
        // Alter the server to not accept the first two requests
        server.removeAllListeners('stream')
        server.on('stream', (stream, headers) => 
        {
          attempts++

          if(attempts < 3) 
          {
            stream.destroy()
          } 
          else
          {
            stream.respond({ ':status': 200, 'content-type': 'application/json' })
            stream.end(JSON.stringify({ success: true }))
          }
        })
    
        const response = await request.get({ url:'/retry-test', retry: 3, retryDelay: 100 })
        assert.equal(response.status, 200, 'Should return a 200 status code after retries')
        assert.deepEqual(response.body, { success: true }, 'Should return the correct body')
        assert.equal(attempts, 3, 'Should make exactly 3 attempts')
      })
    
      test('Supports request timeout', async () => 
      {
        // Alter the server to delay the response by 0.5 seconds
        server.removeAllListeners('stream')
        server.on('stream', (stream) => 
        {
          setTimeout(() => stream.destroy(), 500)
        })

        await assert.rejects(
          request.get({ url: '/timeout-test', timeout: 100 }),
          (error) => error.code === 'E_HTTP_REQUEST_CLIENT_TIMEOUT',
          'Should throw a timeout error')
      })
    })
  })
})
