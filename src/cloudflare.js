'use strict';

class CloudflareApiError extends Error {
  constructor(message, details = {}) {
    super(message);
    this.name = 'CloudflareApiError';
    this.status = details.status;
    this.body = details.body;
    this.errors = details.errors;
  }
}

function compactCloudflareBody(json) {
  if (!json || typeof json !== 'object') return json;
  return {
    success: json.success,
    errors: json.errors,
    messages: json.messages,
    result_info: json.result_info,
  };
}

class CloudflareClient {
  constructor(options) {
    if (!options || !options.apiToken) {
      throw new Error('Cloudflare API token is required');
    }

    this.apiToken = options.apiToken;
    this.logger = options.logger;
    this.baseUrl = options.baseUrl || 'https://api.cloudflare.com/client/v4';
  }

  async request(pathname, options = {}) {
    const url = `${this.baseUrl}${pathname}`;
    const headers = {
      authorization: `Bearer ${this.apiToken}`,
      accept: 'application/json',
      ...(options.headers || {}),
    };

    let body;
    if (options.body !== undefined) {
      headers['content-type'] = 'application/json';
      body = JSON.stringify(options.body);
    }

    const response = await fetch(url, {
      method: options.method || 'GET',
      headers,
      body,
    });

    const text = await response.text();
    let json;
    try {
      json = text ? JSON.parse(text) : {};
    } catch (_error) {
      json = { success: false, errors: [{ message: text || 'non-JSON response body' }] };
    }

    if (!response.ok || json.success === false) {
      const compact = compactCloudflareBody(json);
      throw new CloudflareApiError(`Cloudflare API ${options.method || 'GET'} ${pathname} failed`, {
        status: response.status,
        body: compact,
        errors: json.errors,
      });
    }

    return json;
  }

  async getZoneIdByName(zoneName) {
    const params = new URLSearchParams({ name: zoneName, per_page: '50' });
    const json = await this.request(`/zones?${params.toString()}`);
    const zones = Array.isArray(json.result) ? json.result : [];
    const exact = zones.filter((zone) => String(zone.name).toLowerCase() === zoneName.toLowerCase());

    if (exact.length === 0) {
      throw new CloudflareApiError(`Cloudflare zone not found: ${zoneName}`, {
        status: 404,
        body: { success: false, errors: [{ message: `zone not found: ${zoneName}` }] },
      });
    }

    if (exact.length > 1) {
      throw new CloudflareApiError(`Multiple Cloudflare zones matched: ${zoneName}`, {
        status: 409,
        body: { success: false, errors: [{ message: `multiple zones matched: ${zoneName}` }] },
      });
    }

    return exact[0].id;
  }

  async listRecordsByName(zoneId, recordName) {
    const records = [];
    let page = 1;

    while (true) {
      const params = new URLSearchParams({
        name: recordName,
        page: String(page),
        per_page: '100',
      });

      const json = await this.request(`/zones/${encodeURIComponent(zoneId)}/dns_records?${params.toString()}`);
      const pageRecords = Array.isArray(json.result) ? json.result : [];
      records.push(...pageRecords);

      const resultInfo = json.result_info || {};
      const totalPages = Number(resultInfo.total_pages || 1);
      if (page >= totalPages || pageRecords.length === 0) break;
      page += 1;
    }

    return records.filter((record) => String(record.name).toLowerCase() === recordName.toLowerCase());
  }

  async createRecord(zoneId, record) {
    const body = {
      type: record.type,
      name: record.name,
      content: record.content,
      proxied: record.proxied,
      ttl: record.ttl || 1,
    };

    return this.request(`/zones/${encodeURIComponent(zoneId)}/dns_records`, {
      method: 'POST',
      body,
    });
  }

  async patchRecord(zoneId, recordId, patch) {
    return this.request(`/zones/${encodeURIComponent(zoneId)}/dns_records/${encodeURIComponent(recordId)}`, {
      method: 'PATCH',
      body: patch,
    });
  }
}

module.exports = {
  CloudflareApiError,
  CloudflareClient,
};
