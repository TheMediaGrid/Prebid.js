/**
 * This module adds Bidswitch to the User ID module
 * The {@link module:modules/userId} module is required
 * @module modules/bidswitchSubmodule
 * @requires module:modules/userId
 */

import * as utils from '../src/utils.js'
import { ajax } from '../src/ajax.js';
import { submodule } from '../src/hook.js';
import { getStorageManager } from '../src/storageManager.js';
import { uspDataHandler } from '../src/adapterManager.js';

const MODULE_NAME = 'bidswitchId';
const ID_NAME = 'bsw_id';
const FPID_NAME = 'fpId';
const FPID_STRG_KEY_NAME = '1st_bsw_uid';

export const storage = getStorageManager();

/** @type {Submodule} */
export const bidswitchSubmodule = {
  /**
   * used to link submodule with config
   * @type {string}
   */
  name: MODULE_NAME,
  /**
   * decode the stored id value for passing to bid requests
   * @function
   * @param {{userId: string, fpId: string}} value
   * @returns {{bsw_id:{id:string, ext: object}}}
   */
  decode(value = {}) {
    const {userId: id, ...ext} = value;
    return { [ID_NAME]: { id, ext } };
  },
  /**
   * performs action to obtain id and return a value in the callback's response argument
   * @function
   * @param {ConsentData} [consentData]
   * @param {SubmoduleConfig} [config]
   * @returns {IdResponse|undefined}
   */
  getId(config, consentData) {
    const configParams = (config && config.params) || {};

    const hasGdpr = (consentData && typeof consentData.gdprApplies === 'boolean' && consentData.gdprApplies) ? 1 : 0;
    const gdprConsentString = hasGdpr ? consentData.consentString : '';
    const uspConsent = uspDataHandler.getConsentData();
    // use protocol relative urls for http or https
    if (hasGdpr && (!gdprConsentString || gdprConsentString === '')) {
      utils.logInfo('Consent string is required to call envelope API.');
      return;
    }
    const firstPartyId = getFirstPartyId();
    const domain = configParams.devMode ? 'dev.verona.iponweb.net' : 'grid.bidswitch.net';
    const url = `https://${domain}/syncme?1st_party_uid=${firstPartyId}&gdpr=${hasGdpr}&gdpr_consent=${gdprConsentString}&us_privacy=${uspConsent}`;
    let resp;
    resp = function (callback) {
      const callbacks = {
        success: response => {
          let responseObj;
          if (response) {
            try {
              responseObj = typeof response === 'string' ? JSON.parse(response) : response;
            } catch (error) {
              utils.logError(error);
            }
          }
          const {userId, fpId} = responseObj || {};
          if (fpId) {
            setFirstPartyId(fpId);
          }
          callback({userId, fpId});
        },
        error: error => {
          utils.logError(`${MODULE_NAME}: bswId fetch encountered an error`, error);
          callback();
        }
      };
      jsonPRequest(url, callbacks);
      // ajax(url, callbacks, undefined, {method: 'GET', withCredentials: true});
    };

    return {callback: resp};
  }
};

function getFirstPartyId() {
  let fpId = storage.localStorageIsEnabled ? storage.getDataFromLocalStorage(FPID_STRG_KEY_NAME) : null;
  if (!fpId) {
    fpId = storage.cookiesAreEnabled ? storage.getCookie(FPID_STRG_KEY_NAME) : null;
  }
  return fpId || '';
}

function setFirstPartyId(fpId) {
  if (fpId) {
    if (storage.localStorageIsEnabled) {
      storage.setDataInLocalStorage(FPID_STRG_KEY_NAME, fpId);
    } else if (storage.cookiesAreEnabled) {
      storage.setCookie(FPID_STRG_KEY_NAME, fpId);
    }
  }
}

function jsonPRequest(url, callback) {
  let callbacks = typeof callback === 'object' && callback !== null ? callback : {
    success: function() {},
    error: function(e) {}
  };

  if (typeof callback === 'function') {
    callbacks.success = callback;
  }
  const cbName = 'bsw_cb_' + Math.random().toString(32).slice(2);
  window[cbName] = function(data) {
    delete window[cbName];
    callbacks.success(data);
  };
  const script = document.createElement('script');
  const afterScript = () => {
    delete window[cbName];
    script.parentNode && script.parentNode.removeChild(script);
  };
  script.setAttribute('type', 'text/javascript');
  script.src = url + '&cb=' + cbName;
  script.onload = () => {
    setTimeout(afterScript, 100);
  };
  script.onerror = (error) => {
    afterScript();
    callbacks.error(error && (error.message || error.error) && new Error(error.message || error.error) || new Error('Unknown script error'));
  };
  const head = (document.getElementsByTagName('head') || [])[0];
  if (head) {
    head.appendChild(script);
  } else {
    callbacks.error(new Error('There is no head tag'));
  }
}

submodule('userId', bidswitchSubmodule);
