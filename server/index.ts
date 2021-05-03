global['fetch'] = require('node-fetch');
import express from 'express';
import { getAddress } from '@ethersproject/address';
import { spaceIdsFailed, spaces } from './helpers/spaces';
import db from './helpers/mysql';
import relayer from './helpers/relayer';
import { pinJson } from './helpers/ipfs';
import {
  verifySignature,
  jsonParse,
  sendError,
  hashPersonalMessage,
  formatMessage
} from './helpers/utils';
import { addOrUpdateSpace, loadSpace } from './helpers/adapters/mysql';
import writer from './writer';
import pkg from '../package.json';

const router = express.Router();
const network = process.env.NETWORK || 'testnet';

router.get('/', (req, res) => {
  return res.json({
    name: pkg.name,
    network,
    version: pkg.version,
    tag: 'alpha',
    relayer: relayer.address
  });
});

router.get('/spaces/poke', async (req, res) => {
  res.json(spaceIdsFailed);
  const spacesFailed = await Promise.all(
    spaceIdsFailed.filter(id => !!id).map(id => loadSpace(id))
  );
  spacesFailed.forEach((space, index) => {
    if (space) {
      spaces[spaceIdsFailed[index]] = space;
      delete spaceIdsFailed[index];
    }
  });
  return;
});

router.get('/spaces/:key?', (req, res) => {
  const { key } = req.params;
  return res.json(key ? spaces[key] : spaces);
});

router.get('/spaces/:key/poke', async (req, res) => {
  const { key } = req.params;
  const space = await loadSpace(key);
  if (space) {
    await addOrUpdateSpace(key, space);
    spaces[key] = space;
  }
  return res.json(space);
});

router.get('/:space/proposals', async (req, res) => {
  const { space } = req.params;
  const query =
    "SELECT * FROM messages WHERE type = 'proposal' AND space = ? ORDER BY timestamp DESC LIMIT 100";
  db.queryAsync(query, [space]).then(messages => {
    res.json(
      Object.fromEntries(messages.map(message => formatMessage(message)))
    );
  });
});

router.get('/:space/proposal/:id', async (req, res) => {
  const { space, id } = req.params;
  const query = `SELECT * FROM messages WHERE type = 'vote' AND space = ? AND JSON_EXTRACT(payload, "$.proposal") = ? ORDER BY timestamp ASC`;
  db.queryAsync(query, [space, id]).then(messages => {
    res.json(
      Object.fromEntries(
        messages.map(message => {
          const metadata = JSON.parse(message.metadata);
          const address = getAddress(message.address);
          return [
            address,
            {
              address,
              msg: {
                version: message.version,
                timestamp: message.timestamp.toString(),
                space: message.space,
                type: message.type,
                payload: JSON.parse(message.payload)
              },
              sig: message.sig,
              authorIpfsHash: message.id,
              relayerIpfsHash: metadata.relayer_ipfs_hash
            }
          ];
        })
      )
    );
  });
});

router.get('/voters', async (req, res) => {
  const { from = 0, to = 1e24 } = req.query;
  const spacesArr = req.query.spaces
    ? (req.query.spaces as string).split(',')
    : Object.keys(spaces);
  const query = `SELECT address, timestamp, space FROM messages WHERE type = 'vote' AND timestamp >= ? AND timestamp <= ? AND space IN (?) GROUP BY address ORDER BY timestamp DESC`;
  const messages = await db.queryAsync(query, [from, to, spacesArr]);
  res.json(messages);
});

router.post('/message', async (req, res) => {
  if (process.env.MAINTENANCE)
    return sendError(res, 'update in progress, try later');

  const body = req.body;
  const msg = jsonParse(body.msg);
  const ts = Date.now() / 1e3;
  const overTs = (ts + 300).toFixed();
  const underTs = (ts - 300).toFixed();

  if (!body || !body.address || !body.msg || !body.sig)
    return sendError(res, 'wrong message body');

  if (
    Object.keys(msg).length !== 5 ||
    !msg.space ||
    !msg.payload ||
    Object.keys(msg.payload).length === 0
  )
    return sendError(res, 'wrong signed message');

  if (!spaces[msg.space] && msg.type !== 'settings')
    return sendError(res, 'unknown space');

  if (
    !msg.timestamp ||
    typeof msg.timestamp !== 'string' ||
    msg.timestamp.length !== 10 ||
    msg.timestamp > overTs ||
    msg.timestamp < underTs
  )
    return sendError(res, 'wrong timestamp');

  if (!msg.version || msg.version !== pkg.version)
    return sendError(res, 'wrong version');

  if (!msg.type || !Object.keys(writer).includes(msg.type))
    return sendError(res, 'wrong message type');

  if (
    !(await verifySignature(
      body.address,
      body.sig,
      hashPersonalMessage(body.msg)
    ))
  )
    return sendError(res, 'wrong signature');

  try {
    await writer[msg.type].verify(body);
  } catch (e) {
    return sendError(res, e);
  }

  const authorIpfsRes = await pinJson(`snapshot/${body.sig}`, {
    address: body.address,
    msg: body.msg,
    sig: body.sig,
    version: '2'
  });
  const relayerSig = await relayer.signMessage(authorIpfsRes);
  const relayerIpfsRes = await pinJson(`snapshot/${relayerSig}`, {
    address: relayer.address,
    msg: authorIpfsRes,
    sig: relayerSig,
    version: '2'
  });

  try {
    await writer[msg.type].action(body, authorIpfsRes, relayerIpfsRes);
  } catch (e) {
    return sendError(res, e);
  }

  fetch('https://snapshot.collab.land/api', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      network,
      body,
      authorIpfsRes,
      relayerIpfsRes
    })
  })
    .then(res => res.json())
    .then(json => console.log('Webhook success', json))
    .catch(result => console.error('Webhook error', result));

  console.log(
    `Address "${body.address}"\n`,
    `Space "${msg.space}"\n`,
    `Type "${msg.type}"\n`,
    `IPFS hash "${authorIpfsRes}"`
  );

  return res.json({ ipfsHash: authorIpfsRes });
});

export default router;
