/// <reference path="./auth.type.d.ts" />

import { DidType, fromPublicKey } from '@arcblock/did';
import { auth } from '@blocklet/sdk/lib/middlewares';
import getWallet from '@blocklet/sdk/lib/wallet';
import { getHasher, getSigner, types } from '@ocap/mcrypto';
import type { BytesType } from '@ocap/util';
import type { WalletObject } from '@ocap/wallet';
import type { NextFunction, Request, Response } from 'express';
import stringify from 'json-stable-stringify';

const TOKEN_EXPIRES_IN_SECONDS = 30;

export const wallet: WalletObject = getWallet();

const ADMIN_ROLES = ['owner', 'admin'];

export const ensureAdmin = auth({ roles: ADMIN_ROLES });

const signer = getSigner(DidType('default').pk!);

function hashData({ appId, timestamp, data }: { appId: string; timestamp: number; data: object }) {
  const hasher = getHasher(DidType('default').hash!);
  return hasher(stringify({ appId, timestamp, data: data || {} }), 1);
}

export function appIdFromPublicKey(publicKey: BytesType) {
  return fromPublicKey(
    publicKey,
    DidType({ role: types.RoleType.ROLE_APPLICATION, pk: types.KeyType.ED25519, hash: types.HashType.SHA3 })
  );
}

export function verifyRemoteComponentCall({
  appId,
  timestamp,
  data,
  sig,
  pk,
  expiresIn = TOKEN_EXPIRES_IN_SECONDS,
}: {
  appId: string;
  timestamp: number;
  data: object;
  sig: string;
  pk: BytesType;
  expiresIn?: number;
}) {
  if (Math.abs(Date.now() / 1000 - timestamp) > expiresIn) throw new Error('signature expired');

  return signer.verify(hashData({ appId, timestamp, data }), sig, pk);
}

export function signRemoteComponentCall({ data }: { data: object }) {
  const appId = wallet.address;
  const timestamp = Math.round(Date.now() / 1000);

  return { appId, timestamp, sig: signer.sign(hashData({ appId, timestamp, data }), wallet.secretKey) };
}

export function getRemoteComponentCallHeaders(data: object) {
  const { appId, timestamp, sig } = signRemoteComponentCall({ data });

  return {
    'x-app-id': appId,
    'x-timestamp': timestamp.toString(),
    'x-component-sig': sig,
  };
}

export function ensureRemoteComponentCall(
  getPublicKey: (appId: string) => Promise<BytesType>,
  fallback?: (req: Request, res: Response, next: NextFunction) => any
) {
  return async (req: Request, res: Response, next: NextFunction) => {
    try {
      const sig = req.get('x-component-sig');
      const appId = req.get('x-app-id');
      const timestamp = req.get('x-timestamp');

      if (!sig || !appId || !timestamp) {
        throw new Error('Missing required headers x-component-sig/x-app-id/x-timestamp');
      }

      const pk = await getPublicKey(appId);
      if (appIdFromPublicKey(pk) !== appId) throw new Error('appId and public key not match');

      if (
        !verifyRemoteComponentCall({
          appId,
          sig,
          timestamp: parseInt(timestamp, 10),
          data: req.body,
          pk,
        })
      ) {
        throw new Error('Validate signature error');
      }

      req.appClient = {
        appId,
      };
    } catch (error) {
      if (!fallback) throw error;

      fallback(req, res, next);
      return;
    }

    next();
  };
}
