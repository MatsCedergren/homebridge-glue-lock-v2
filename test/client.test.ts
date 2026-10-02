import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { GlueApi, issueApiKey } from '../src/api/client';
import { Lock, LockOperationType } from '../src/api';
import locks from './fixtures/locks.json';

const API_URL = 'https://user-api.gluehome.com';

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
}

describe('GlueApi', () => {
  const fetchMock = vi.fn<typeof fetch>();

  beforeEach(() => {
    vi.stubGlobal('fetch', fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    fetchMock.mockReset();
  });

  function lastRequest() {
    const [url, init] = fetchMock.mock.calls.at(-1)!;
    return { url: String(url), init: init!, headers: init!.headers as Record<string, string> };
  }

  it('lists locks from the fixture and sends the API key header', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse(locks));

    const result = await new GlueApi('test-key').getLocks();

    expect(result).toHaveLength(1);
    expect(result[0]).toBeInstanceOf(Lock);
    expect(result[0].description).toBe('Ytterdörren');
    expect(result[0].lastLockEvent?.eventType).toBe('pressAndGo');
    expect(result[0].getLockModel()).toBe('GLUE');

    const { url, init, headers } = lastRequest();
    expect(url).toBe(`${API_URL}/v1/locks`);
    expect(init.method).toBe('GET');
    expect(headers['Authorization']).toBe('Api-Key test-key');
    expect(headers['Content-Type']).toBeUndefined();
  });

  it('reads one lock', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse(locks[0]));

    const lock = await new GlueApi('test-key').getLock(locks[0].id);

    expect(lock.connectionStatus).toBe('connected');
    expect(lastRequest().url).toBe(`${API_URL}/v1/locks/${locks[0].id}`);
  });

  it('creates an operation with a JSON body', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ id: 'op-1', status: 'pending' }, 201));

    const operation = await new GlueApi('test-key').createLockOperation('lock-1', { type: LockOperationType.Lock });

    expect(operation.id).toBe('op-1');
    expect(operation.isFinished()).toBe(false);
    const { url, init, headers } = lastRequest();
    expect(url).toBe(`${API_URL}/v1/locks/lock-1/operations`);
    expect(init.method).toBe('POST');
    expect(init.body).toBe('{"type":"lock"}');
    expect(headers['Content-Type']).toBe('application/json');
  });

  it('reads the status of an operation', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ id: 'op-1', status: 'failed', reason: 'jammed' }));

    const operation = await new GlueApi('test-key').getLockOperation('lock-1', 'op-1');

    expect(operation.status).toBe('failed');
    expect(operation.reason).toBe('jammed');
    expect(lastRequest().url).toBe(`${API_URL}/v1/locks/lock-1/operations/op-1`);
  });

  it('reports 401 as wrong authentication data, without the key', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ title: 'Unauthorized' }, 401));

    const error = (await new GlueApi('secret-key').getLocks().catch(e => e)) as Error;

    expect(error).toBeInstanceOf(Error);
    expect(error.message).toBe('Wrong authentication data provided. Please check the plugin configuration.');
    expect(error.message).not.toContain('secret-key');
  });

  it('reports an API error body', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ title: 'Not Found', code: 404, correlationId: 'c-1', detail: 'no lock' }, 404));

    await expect(new GlueApi('test-key').getLock('missing')).rejects.toThrow('Not Found (code: 404 correlationId: c-1 details: no lock)');
  });

  it('reports an error without a JSON body', async () => {
    fetchMock.mockResolvedValueOnce(new Response('bad gateway', { status: 502, statusText: 'Bad Gateway' }));

    await expect(new GlueApi('test-key').getLocks()).rejects.toThrow('HTTP 502 Bad Gateway');
  });

  it('passes network errors on', async () => {
    fetchMock.mockRejectedValueOnce(new TypeError('fetch failed'));

    await expect(new GlueApi('test-key').getLocks()).rejects.toThrow('fetch failed');
  });
});

describe('issueApiKey', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('uses Basic auth and the correct Content-Type header', async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValueOnce(jsonResponse({ apiKey: 'new-key' }, 201));
    vi.stubGlobal('fetch', fetchMock);

    const key = await issueApiKey('user', 'pass');

    expect(key).toBe('new-key');
    const [url, init] = fetchMock.mock.calls[0];
    const headers = init!.headers as Record<string, string>;
    expect(String(url)).toBe(`${API_URL}/v1/api-keys`);
    expect(headers['Content-Type']).toBe('application/json');
    expect(headers['Contenty-Type']).toBeUndefined();
    expect(headers['Authorization']).toBe(`Basic ${Buffer.from('user:pass').toString('base64')}`);
    expect(JSON.parse(String(init!.body)).scopes).toEqual(['locks.write', 'locks.read', 'events.read']);
  });
});
