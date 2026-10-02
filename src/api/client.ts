// Modified by Mats Cedergren, 2026: replaced axios with the built-in fetch API; removed API key creation.
import { Lock, LockOperation, CreateLockOperation } from './';
import { PLATFORM_NAME, VERSION, OS_VERSION } from '../settings';

const API_URL = 'https://user-api.gluehome.com';
const USER_AGENT = `${PLATFORM_NAME}/${VERSION} (${OS_VERSION})`;
const REQUEST_TIMEOUT_MS = 60000;

export interface ApiError {
    code: number;
    detail: string;
    correlationId: string;
}

async function describeError(response: Response): Promise<string> {
  if (response.status === 401) {
    return 'Wrong authentication data provided. Please check the plugin configuration.';
  }

  try {
    const { title, code, correlationId, detail } = await response.json() as ApiError & { title: string };
    return `${title} (code: ${code} correlationId: ${correlationId} details: ${detail})`;
  } catch {
    return `HTTP ${response.status} ${response.statusText}`;
  }
}

export class GlueApi {
  private readonly apiKey: string;

  constructor(apiKey: string) {
    this.apiKey = apiKey;
  }

  public getLocks(): Promise<Lock[]> {
    return this.request<Lock[]>('GET', '/v1/locks')
      .then(data => data?.map(Lock.fromJson) ?? []);
  }

  public getLock(id: string): Promise<Lock> {
    return this.request<Lock>('GET', `/v1/locks/${id}`)
      .then(Lock.fromJson);
  }

  public getLockOperation(id: string, operationId: string): Promise<LockOperation> {
    return this.request<LockOperation>('GET', `/v1/locks/${id}/operations/${operationId}`)
      .then(LockOperation.fromJson);
  }

  public createLockOperation(id: string, operation: CreateLockOperation): Promise<LockOperation> {
    return this.request<LockOperation>('POST', `/v1/locks/${id}/operations`, operation)
      .then(LockOperation.fromJson);
  }

  private async request<T>(method: string, path: string, body?: unknown): Promise<T> {
    const headers: Record<string, string> = {
      'Authorization': `Api-Key ${this.apiKey}`,
      'User-Agent': USER_AGENT,
    };
    if (body !== undefined) {
      headers['Content-Type'] = 'application/json';
    }

    const response = await fetch(`${API_URL}${path}`, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });

    if (!response.ok) {
      throw new Error(await describeError(response));
    }

    return await response.json() as T;
  }
}
