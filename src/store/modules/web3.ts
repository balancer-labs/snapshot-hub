import Vue from 'vue';
import { ethers } from 'ethers';
import { AddressZero } from 'ethers/constants';
import { formatEther, getAddress, Interface } from 'ethers/utils';
import abi from '@/helpers/abi';
import config from '@/helpers/config';
import connectors from '@/helpers/connectors';

const infuraId = process.env.VUE_APP_INFURA_ID;
const backupUrls = {
  1: `https://mainnet.infura.io/v3/${infuraId}`,
  42: `https://kovan.infura.io/v3/${infuraId}`
};
let provider;
let web3;

const state = {
  injectedLoaded: false,
  injectedChainId: null,
  account: null,
  name: null,
  active: false,
  balances: {},
  dsProxyAddress: null,
  proxyAllowances: {},
  currentBlockNumber: 0
};

const getters = {
  hasProxy: state => {
    const proxyAddress = state.dsProxyAddress;
    return !!proxyAddress && proxyAddress !== AddressZero;
  }
};

const mutations = {
  LOAD_WEB3_REQUEST() {
    console.debug('LOAD_WEB3_REQUEST');
  },
  LOAD_WEB3_SUCCESS() {
    console.debug('LOAD_WEB3_SUCCESS');
  },
  LOAD_WEB3_FAILURE(_state, payload) {
    console.debug('LOAD_WEB3_FAILURE', payload);
  },
  LOAD_PROVIDER_REQUEST() {
    console.debug('LOAD_PROVIDER_REQUEST');
  },
  LOAD_PROVIDER_SUCCESS(_state, payload) {
    Vue.set(_state, 'injectedLoaded', payload.injectedLoaded);
    Vue.set(_state, 'injectedChainId', payload.injectedChainId);
    Vue.set(_state, 'account', payload.account);
    Vue.set(_state, 'name', payload.name);
    Vue.set(_state, 'currentBlockNumber', payload.currentBlockNumber);
    console.debug('LOAD_PROVIDER_SUCCESS');
  },
  LOAD_PROVIDER_FAILURE(_state, payload) {
    Vue.set(_state, 'injectedLoaded', false);
    Vue.set(_state, 'injectedChainId', null);
    Vue.set(_state, 'account', null);
    Vue.set(_state, 'active', false);
    console.debug('LOAD_PROVIDER_FAILURE', payload);
  },
  LOAD_BACKUP_PROVIDER_REQUEST() {
    console.debug('LOAD_BACKUP_PROVIDER_REQUEST');
  },
  LOAD_BACKUP_PROVIDER_SUCCESS(_state, payload) {
    console.debug('LOAD_BACKUP_PROVIDER_SUCCESS', payload);
  },
  LOAD_BACKUP_PROVIDER_FAILURE(_state, payload) {
    Vue.set(_state, 'injectedLoaded', false);
    Vue.set(_state, 'backUpLoaded', false);
    Vue.set(_state, 'account', null);
    Vue.set(_state, 'activeChainId', null);
    Vue.set(_state, 'active', false);
    console.debug('LOAD_BACKUP_PROVIDER_FAILURE', payload);
  },
  HANDLE_CHAIN_CHANGED() {
    console.debug('HANDLE_CHAIN_CHANGED');
  },
  HANDLE_ACCOUNTS_CHANGED(_state, payload) {
    Vue.set(_state, 'account', payload);
    console.debug('HANDLE_ACCOUNTS_CHANGED', payload);
  },
  HANDLE_CLOSE_CHANGED() {
    console.debug('HANDLE_CLOSE_CHANGED');
  },
  HANDLE_NETWORK_CHANGED() {
    console.debug('HANDLE_NETWORK_CHANGED');
  },
  LOOKUP_ADDRESS_REQUEST() {
    console.debug('LOOKUP_ADDRESS_REQUEST');
  },
  LOOKUP_ADDRESS_SUCCESS(_state, payload) {
    Vue.set(_state, 'name', payload);
    console.debug('LOOKUP_ADDRESS_SUCCESS');
  },
  LOOKUP_ADDRESS_FAILURE(_state, payload) {
    console.debug('LOOKUP_ADDRESS_FAILURE', payload);
  },
  RESOLVE_NAME_REQUEST() {
    console.debug('RESOLVE_NAME_REQUEST');
  },
  RESOLVE_NAME_SUCCESS() {
    console.debug('RESOLVE_NAME_SUCCESS');
  },
  RESOLVE_NAME_FAILURE(_state, payload) {
    console.debug('RESOLVE_NAME_FAILURE', payload);
  },
  SEND_TRANSACTION_REQUEST() {
    console.debug('SEND_TRANSACTION_REQUEST');
  },
  SEND_TRANSACTION_SUCCESS() {
    console.debug('SEND_TRANSACTION_SUCCESS');
  },
  SEND_TRANSACTION_FAILURE(_state, payload) {
    console.debug('SEND_TRANSACTION_FAILURE', payload);
  },
  SIGN_MESSAGE_REQUEST() {
    console.debug('SIGN_MESSAGE_REQUEST');
  },
  SIGN_MESSAGE_SUCCESS() {
    console.debug('SIGN_MESSAGE_SUCCESS');
  },
  SIGN_MESSAGE_FAILURE(_state, payload) {
    console.debug('SIGN_MESSAGE_FAILURE', payload);
  },
  GET_BALANCES_REQUEST() {
    console.debug('GET_BALANCES_REQUEST');
  },
  GET_BALANCES_SUCCESS(_state, payload) {
    Vue.set(_state, 'balances', payload);
    console.debug('GET_BALANCES_SUCCESS');
  },
  GET_BALANCES_FAILURE(_state, payload) {
    console.debug('GET_BALANCES_FAILURE', payload);
  }
};

const actions = {
  login: async ({ dispatch }, connector = 'injected') => {
    const options = config.connectors[connector].options || {};
    provider = await connectors[connector](options);
    if (provider) {
      web3 = new ethers.providers.Web3Provider(provider);
      await dispatch('loadWeb3');
    }
  },
  loadWeb3: async ({ commit, dispatch }) => {
    commit('LOAD_WEB3_REQUEST');
    try {
      await dispatch('loadProvider');
      await dispatch('loadAccount');
      commit('LOAD_WEB3_SUCCESS');
      if (!state.injectedLoaded || state.injectedChainId !== config.chainId) {
        await dispatch('loadBackupProvider');
      } else {
        /**
        this.providerStatus.activeChainId = this.providerStatus.injectedChainId;
        this.providerStatus.injectedActive = true;
        if (this.providerStatus.account)
          this.fetchUserBlockchainData(this.providerStatus.account);
        */
      }
    } catch (e) {
      commit('LOAD_WEB3_FAILURE', e);
      return Promise.reject();
    }
  },
  loadProvider: async ({ commit, dispatch }) => {
    commit('LOAD_PROVIDER_REQUEST');
    try {
      // @TODO Remove any old listeners
      if (provider.on) {
        provider.on('chainChanged', async () => {
          commit('HANDLE_CHAIN_CHANGED');
          if (state.active) {
            await dispatch('loadWeb3');
          }
        });
        provider.on('accountsChanged', async accounts => {
          if (accounts.length === 0) {
            if (state.active) await dispatch('loadWeb3');
          } else {
            commit('HANDLE_ACCOUNTS_CHANGED', accounts[0]);
            await dispatch('loadAccount');
          }
        });
        provider.on('close', async () => {
          commit('HANDLE_CLOSE');
          if (state.active) await dispatch('loadWeb3');
        });
        provider.on('networkChanged', async () => {
          commit('HANDLE_NETWORK_CHANGED');
          if (state.active) {
            await dispatch('loadWeb3');
          }
        });
      }
      const network = await web3.getNetwork();
      const accounts = await web3.listAccounts();
      const account = accounts.length > 0 ? accounts[0] : null;
      const currentBlockNumber = await web3.getBlockNumber();
      commit('LOAD_PROVIDER_SUCCESS', {
        injectedLoaded: true,
        injectedChainId: network.chainId,
        account,
        name,
        currentBlockNumber
      });
    } catch (e) {
      commit('LOAD_PROVIDER_FAILURE', e);
      return Promise.reject();
    }
  },
  loadBackupProvider: async ({ commit }) => {
    try {
      const web3 = new ethers.providers.JsonRpcProvider(
        backupUrls[config.chainId]
      );
      const network = await web3.getNetwork();
      commit('LOAD_BACKUP_PROVIDER_SUCCESS', {
        injectedActive: false,
        backUpLoaded: true,
        account: null,
        activeChainId: network.chainId
        // backUpWeb3: web3,
      });
    } catch (e) {
      commit('LOAD_BACKUP_PROVIDER_FAILURE', e);
      return Promise.reject();
    }
  },
  lookupAddress: async ({ commit }) => {
    commit('LOOKUP_ADDRESS_REQUEST');
    try {
      const name = await web3.lookupAddress(state.account);
      commit('LOOKUP_ADDRESS_SUCCESS', name);
      return name;
    } catch (e) {
      commit('LOOKUP_ADDRESS_FAILURE', e);
    }
  },
  resolveName: async ({ commit }, payload) => {
    commit('RESOLVE_NAME_REQUEST');
    try {
      const address = await web3.resolveName(payload);
      commit('RESOLVE_NAME_SUCCESS');
      return address;
    } catch (e) {
      commit('RESOLVE_NAME_FAILURE', e);
      return Promise.reject();
    }
  },
  sendTransaction: async (
    { commit },
    [contractType, contractAddress, action, params]
  ) => {
    commit('SEND_TRANSACTION_REQUEST');
    try {
      const signer = web3.getSigner();
      const contract = new ethers.Contract(
        getAddress(contractAddress),
        abi[contractType],
        web3
      );
      const contractWithSigner = contract.connect(signer);
      const tx = await contractWithSigner[action](...params);
      await tx.wait();
      commit('SEND_TRANSACTION_SUCCESS');
      return tx;
    } catch (e) {
      commit('SEND_TRANSACTION_FAILURE', e);
      return Promise.reject();
    }
  },
  signMessage: async ({ commit }, message) => {
    commit('SIGN_MESSAGE_REQUEST');
    try {
      const signer = web3.getSigner();
      const sig = await signer.signMessage(message);
      commit('SIGN_MESSAGE_SUCCESS');
      return sig;
    } catch (e) {
      commit('SIGN_MESSAGE_FAILURE', e);
      return Promise.reject();
    }
  },
  loadAccount: async ({ dispatch }) => {
    await Promise.all([
      dispatch('lookupAddress'),
      dispatch('getBalances'),
      dispatch('getMyPoolShares')
    ]);
  },
  getBalances: async ({ commit }) => {
    commit('GET_BALANCES_REQUEST');
    const address = state.account;
    // @ts-ignore
    const tokens = Object.entries(config.tokens).map(token => token[1].address);
    const promises: any = [];
    const multi = new ethers.Contract(
      config.addresses.multicall,
      abi['Multicall'],
      web3
    );
    const calls = [];
    const testToken = new Interface(abi.TestToken);
    tokens.forEach(token => {
      // @ts-ignore
      calls.push([token, testToken.functions.balanceOf.encode([address])]);
    });
    promises.push(multi.aggregate(calls));
    promises.push(multi.getEthBalance(address));
    const balances: any = {};
    try {
      // @ts-ignore
      const [[, response], ethBalance] = await Promise.all(promises);
      balances.ether = parseFloat(formatEther(ethBalance as any));
      let i = 0;
      response.forEach(value => {
        if (tokens && tokens[i]) {
          const tokenBalance = testToken.functions.balanceOf.decode(value);
          balances[getAddress(tokens[i])] = parseFloat(
            formatEther(tokenBalance.toString())
          );
        }
        i++;
      });
      commit('GET_BALANCES_SUCCESS', balances);
      return balances;
    } catch (e) {
      commit('GET_BALANCES_FAILURE', e);
      return Promise.reject();
    }
  }
};

export default {
  state,
  getters,
  mutations,
  actions
};