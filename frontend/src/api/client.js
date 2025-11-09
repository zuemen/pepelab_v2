import axios from 'axios';

export function createClient(baseUrl) {
  const instance = axios.create({
    baseURL: baseUrl.replace(/\/$/, ''),
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

  const sandboxPrefix = '/v2';

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
    getNonce: (transactionId, token) =>
      request({
        url: `${sandboxPrefix}/api/credential/nonce`,
        method: 'GET',
        params: { transactionId },
        headers: bearerHeader(token),
      }),
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
