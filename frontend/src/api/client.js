import axios from 'axios';
import { normalizeCid } from '../utils/cid.js';

export function resolveSandboxPrefix(baseUrl) {
  if (!baseUrl) {
    return '/v2';
  }
  try {
    const hasProtocol = /^https?:\/\//i.test(baseUrl);
    const url = hasProtocol
      ? new URL(baseUrl)
      : new URL(baseUrl, 'http://placeholder.local');
    const normalizedPath = url.pathname.replace(/\/+$/, '');
    if (!normalizedPath || normalizedPath === '/' || normalizedPath === '') {
      return '/v2';
    }
    return normalizedPath;
  } catch (error) {
    return '/v2';
  }
}

export function createClient(baseUrl) {
  const sanitizedBase = (baseUrl || '').replace(/\/$/, '');
  const sandboxPrefix = resolveSandboxPrefix(sanitizedBase);

  const instance = axios.create({
    baseURL: sanitizedBase,
    timeout: 8000,
  });

  async function request(config) {
    try {
      const response = await instance.request(config);
      return { ok: true, data: response.data };
    } catch (error) {
      if (error.response) {
        return {
          ok: false,
          status: error.response.status,
          detail: error.response.data?.detail ?? error.response.data,
        };
      }
      return { ok: false, status: 0, detail: error.message };
    }
  }

  const accessTokenHeader = (token) =>
    token
      ? {
          'access-token': token,
        }
      : undefined;

  const bearerHeader = (token) =>
    token
      ? {
          Authorization: `Bearer ${token}`,
        }
      : undefined;

  return {
    issueWithData: (payload, token) =>
      request({
        url: '/api/qrcode/data',
        method: 'POST',
        data: payload,
        headers: accessTokenHeader(token),
      }),
    issueWithoutData: (payload, token) =>
      request({
        url: '/api/qrcode/nodata',
        method: 'POST',
        data: payload,
        headers: accessTokenHeader(token),
      }),
    getNonce: async (transactionId, token) => {
      const normalizedId = encodeURIComponent(transactionId);

      const primary = await request({
        url: `${sandboxPrefix}/api/credential/nonce/${normalizedId}`,
        method: 'GET',
        headers: bearerHeader(token),
      });

      if (
        primary.ok ||
        primary.status !== 404 ||
        (primary.detail && typeof primary.detail !== 'string')
      ) {
        return primary;
      }

      return request({
        url: `${sandboxPrefix}/api/credential/nonce`,
        method: 'GET',
        params: { transactionId },
        headers: bearerHeader(token),
      });
    },
    createVerificationCode: (params, token) =>
      request({
        url: '/api/oidvp/qrcode',
        method: 'GET',
        params,
        headers: accessTokenHeader(token),
      }),
    submitPresentation: (payload, token) =>
      request({
        url: '/api/oidvp/result',
        method: 'POST',
        data: payload,
        headers: accessTokenHeader(token),
      }),
    actOnCredential: (credentialId, actionPayload, token) =>
      request({
        url: `${sandboxPrefix}/api/credential/${credentialId}/action`,
        method: 'PUT',
        data: actionPayload,
        headers: bearerHeader(token),
      }),
    revokeCredential: (credentialId, token) =>
      request({
        url: `${sandboxPrefix}/api/credentials/${credentialId}/revoke`,
        method: 'POST',
        headers: bearerHeader(token),
      }),
    updateCredentialStatus: async (cidRaw, actionRaw, token) => {
      const cid = normalizeCid(cidRaw);
      const action = String(actionRaw ?? '').trim().toLowerCase();

      if (!cid) {
        return {
          ok: false,
          status: 400,
          detail: '缺少有效的 CID，請先透過 nonce 查詢取得。',
        };
      }

      if (action !== 'revocation') {
        return {
          ok: false,
          status: 400,
          detail: 'action 必須為 "revocation"。',
        };
      }

      const commonConfig = {
        method: 'PUT',
        headers: {
          Accept: '*/*',
          'Content-Type': 'application/json',
          ...(bearerHeader(token) || {}),
        },
        data: {},
      };

      const primary = await request({
        ...commonConfig,
        url: `/api/credential/${encodeURIComponent(cid)}/revocation`,
      });

      if (primary.ok || primary.status !== 404) {
        return primary;
      }

      const prefix = (sandboxPrefix || '').replace(/\/+$/, '');
      if (!prefix || prefix === '/api') {
        return primary;
      }

      return request({
        ...commonConfig,
        url: `${prefix}/api/credential/${encodeURIComponent(cid)}/revocation`,
      });
    },
    deleteCredential: (credentialId, token) =>
      request({
        url: `${sandboxPrefix}/api/credentials/${credentialId}`,
        method: 'DELETE',
        headers: bearerHeader(token),
      }),
    listHolderCredentials: (holderDid, token) =>
      request({
        url: `${sandboxPrefix}/api/wallet/${encodeURIComponent(holderDid)}/credentials`,
        method: 'GET',
        headers: bearerHeader(token),
      }),
    forgetHolder: (holderDid, token) =>
      request({
        url: `${sandboxPrefix}/api/wallet/${encodeURIComponent(holderDid)}/forget`,
        method: 'DELETE',
        headers: bearerHeader(token),
      }),
    purgeSession: (sessionId, token) =>
      request({
        url: `${sandboxPrefix}/api/did/vp/session/${sessionId}`,
        method: 'DELETE',
        headers: bearerHeader(token),
      }),
    resetSandbox: (token) =>
      request({
        url: `${sandboxPrefix}/api/system/reset`,
        method: 'POST',
        headers: bearerHeader(token),
      }),
  };
}
