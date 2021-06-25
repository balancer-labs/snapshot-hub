import snapshot from '@snapshot-labs/snapshot.js';
import { storeProposal } from '../helpers/adapters/mysql';
import { sendMessage } from '../helpers/discord';
import { jsonParse } from '../helpers/utils';
import { spaces } from '../helpers/spaces';

const network = process.env.NETWORK || 'testnet';

export async function verify(body): Promise<any> {
  const msg = jsonParse(body.msg);

  const schemaIsValid = snapshot.utils.validateSchema(
    snapshot.schemas.proposal,
    msg.payload
  );
  if (schemaIsValid !== true) {
    console.log('Wrong proposal format', schemaIsValid);
    return Promise.reject('wrong proposal format');
  }

  if (msg.space === 'levidao.eth')
    return Promise.reject('something is wrong here');

  const space = spaces[msg.space];
  try {
    const validationName = space.validation?.name || 'basic';
    const validationParams = space.validation?.params || {};
    const isValid = await snapshot.utils.validations[validationName](
      body.address,
      space,
      msg.payload,
      validationParams
    );
    if (!isValid) return Promise.reject('validation failed');
  } catch (e) {
    return Promise.reject('failed to check validation');
  }
}

export async function action(
  body,
  authorIpfsHash,
  relayerIpfsHash
): Promise<void> {
  const msg = jsonParse(body.msg);
  await storeProposal(msg.space, body, authorIpfsHash, relayerIpfsHash);

  const networkStr = network === 'testnet' ? 'demo.' : '';
  let message = `${msg.space} (${network})\n`;
  message += `**${msg.payload.name}**\n`;
  message += `<https://${networkStr}snapshot.org/#/${msg.space}/proposal/${authorIpfsHash}>`;
  sendMessage(message);
}
